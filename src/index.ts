import { IncomingMessage, ServerResponse, createServer } from 'http';
import { createDbPool } from './database';
import moment = require('moment');
import { insert } from './routes/insert';
import { TableNames, extendPool, getTableNames } from './table-schema';
import type { LogData } from './types';





type LogAttribute = {
    log_id: number,
    key: string,
    value: string
}

function sortByVal<T>(valueFnc: ((o: T) => number)) {
    const cache = new Map<T, number>()
    return function (a: T, b: T) {
        let aVal;
        if (cache.has(a)) {
            aVal = cache.get(a)
        } else {
            aVal = valueFnc(a)
            cache.set(a, aVal)
        }
        let bVal;
        if (cache.has(b)) {
            bVal = cache.get(b)
        } else {
            bVal = valueFnc(b)
            cache.set(b, bVal)
        }
        return bVal - aVal
    }
}



const searchPastNDays = 7


function generateForDays<T>(generator: ((name: TableNames, index: number) => Promise<T>)) {
    const now = moment()
    return new Array(searchPastNDays).fill(null).map((_, i) => {
        const dateStr = getTableNames(i)

        return generator(dateStr, i)
    })
}




function flatMapFulfilled<T>(array: Array<PromiseSettledResult<Array<T>>>) {
    return array
        .filter((res): res is PromiseFulfilledResult<Array<T>> => res.status === "fulfilled")
        .flatMap(res => res.value)
}



const pathsFunctions: Record<string, (url: URL, req: IncomingMessage, res: ServerResponse) => (void | Promise<void>)> = {
    "/logs": async (url, req, res) => {
        const headers = req.headers as {
            filters?: string
            "start-index"?: string
        }



        let startIndex = 0
        let sql = "SELECT * FROM LOG_TABLE WHERE 'TRUE'='TRUE'"
        let params: Array<string | number> = []

        if (headers['start-index']) {
            startIndex = +headers['start-index']

            if (isNaN(startIndex)) {
                throw new Error("invalid startindex")
            }
        }
        let hasIndexFilter = false
        if (headers.filters) {
            const filterList = JSON.parse(headers.filters) as Array<string>
            for (const filter of filterList) {
                const filterParts = filter.match(/^(?<field>[a-zA-Z]*?)(?<operator>[=><]|!=|\*=)(?<value>.+)$/)
                if (!filterParts?.groups) {
                    throw new Error("couldnt match filter")
                }

                let capitalizeValue = true
                let field: String | null = null
                if (filterParts.groups.field === "severity") {
                    field = "UPPER(severity)"
                } else if (filterParts.groups.field === "message") {
                    field = "UPPER(message)"
                } else if (filterParts.groups.field === "application") {
                    field = "UPPER(application)"
                } else if (filterParts.groups.field === "index") {
                    hasIndexFilter = true
                    field = "UPPER(`index`)"
                } else if (filterParts.groups.field === "timestamp") {
                    capitalizeValue = false
                    field = "`timestamp`"
                } else {
                    sql += "AND ";
                    if (filterParts.groups.operator === "!=") {
                        sql += " NOT ";
                    }
                    sql += `EXISTS(SELECT log_id FROM LOG_ATTRIBUTES_TABLE
                    WHERE LOG_ATTRIBUTES_TABLE.log_id = LOG_TABLE.index
                                    AND UPPER(LOG_ATTRIBUTES_TABLE.\`key\`) = UPPER(?)
                                    AND UPPER(LOG_ATTRIBUTES_TABLE.value) LIKE UPPER(?)
                                ) `;
                    params.push(filterParts.groups.field)
                    params.push(filterParts.groups.value)
                    continue;
                }
                if (field) {
                    sql += "AND " + field;
                }
                if (filterParts.groups.operator == "!=") {
                    sql += " NOT LIKE "
                } else if (filterParts.groups.operator === "=" || filterParts.groups.operator === "*=") {
                    sql += " LIKE "
                } else if (filterParts.groups.operator === ">") {
                    sql += " > "
                } else if (filterParts.groups.operator === "<") {
                    sql += " < "
                } else {
                    throw new Error("invalid operator")
                }
                if (capitalizeValue) {
                    sql += "UPPER(?) ";
                } else {
                    sql += "? ";
                }

                if (filterParts.groups.operator == "*=") {
                    params.push(`%${filterParts.groups.value}%`)
                } else {
                    params.push(filterParts.groups.value)
                }
            }
        }

        //LIMIT 1  OFFSET ?
        //params.push(startIndex)
        sql += "ORDER BY `index` DESC "

        const pool = createDbPool("tpscript")

        const promises = new Array(searchPastNDays).fill(null).map(async (_, i) => {
            const dateStr = getTableNames(i)
            console.log(dateStr)


            function replaceDbName(sql: string) {
                return sql.replace(/LOG_TABLE/g, `\`${dateStr.log}\``)
                    .replace(/LOG_ATTRIBUTES_TABLE/g, `\`${dateStr.logAttr}\``)
            }


            const connection = await pool.getConnection()
            try {
                const tablesReplaced = replaceDbName(sql)


                const result = await connection.query<Array<LogData>>(tablesReplaced, params)

                if (!result.length) {
                    throw new Error("no data")
                }
                let attributeSql = "SELECT * FROM LOG_ATTRIBUTES_TABLE WHERE log_id IN ( "
                let attributeParams: Array<number> = []
                attributeSql += result.map(r => ` ? `).join(",")

                const resultMap: Record<number, LogData> = {}
                for (const log of result) {
                    attributeParams.push(log.index)
                    resultMap[log.index] = log
                }


                const logAttributes = await connection.query<Array<LogAttribute>>(replaceDbName(`${attributeSql} )`), attributeParams)

                for (const logAttr of logAttributes) {
                    resultMap[logAttr.log_id][logAttr.key] = logAttr.value
                }
                return result;
            } finally {
                connection.end()
            }

        });


        let logList: Array<LogData>
        pool.end()
        if (hasIndexFilter) {
            logList = await Promise.any(promises)

        } else {
            const results = await Promise.allSettled(promises)
            logList = results.filter((res): res is PromiseFulfilledResult<LogData[]> => res.status === "fulfilled")
                .flatMap(res => res.value)
                .sort(sortByVal(o => +o.timestamp))

        }
        res.write(JSON.stringify(logList, (k, v) => {
            if (typeof v == "bigint") {
                return Number(v)
            }
            return v
        }))
        res.end()
    },


    "/unique-attribute": async (url, req, res) => {
        const headers = req.headers as {
            "unique-attr"?: string
        }

        if (!headers['unique-attr'] || typeof headers['unique-attr'] != "string") {
            throw new Error("missing attr key")
        }


        let sql
        let params: Array<string> = []
        if (headers['unique-attr'] == "application") {
            sql = "SELECT DISTINCT application FROM LOG_TABLE"
        } else if (headers['unique-attr'] == "severity") {
            sql = "SELECT DISTINCT severity FROM LOG_TABLE"
        } else {
            sql = `SELECT DISTINCT LOG_ATTRIBUTES_TABLE.value
            FROM LOG_ATTRIBUTES_TABLE
                                WHERE LOG_ATTRIBUTES_TABLE.\`key\`= ?
            `
            params.push(headers['unique-attr'])
        }

        const pool = createDbPool("tpscript")
        extendPool(pool)
        const promises = generateForDays(async dateStr => {
            const logdbName = `log${dateStr}`;
            const logAttrdbName = `log_attributes${dateStr}`;
            function replaceDbName(sql: string) {
                return sql.replace(/LOG_TABLE/g, `\`${logdbName}\``)
                    .replace(/LOG_ATTRIBUTES_TABLE/g, `\`${logAttrdbName}\``)
            }

            const connection = await pool.getConnection()
            try {
                return await connection.query<Array<string>>(replaceDbName(sql), params)
            } finally {
                connection.end()
            }
        })
        const results = await Promise.allSettled(promises)
        const merged = flatMapFulfilled(results)
        res.write(JSON.stringify(merged))
        res.end()
    },


    "/insert": insert

}



createServer(async (req, res) => {
    const url = req.url;
    if (url) {
        const urlObj = new URL(url, "http://myhost.net")

        try {
            await pathsFunctions[urlObj.pathname]?.(urlObj, req, res)
        } catch (e) {
            res.end()
            debugger
        }
    }


})
    .listen(19999)



process.on("uncaughtException", e => {
    console.error("uncaughtException", e)
})
process.on("unhandledRejection", e => {
    console.error("unhandledRejection", e)
})