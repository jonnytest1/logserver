import type { IncomingMessage, ServerResponse } from 'http'
import { withPool } from '../database'
import { extendWithReplacement, generateForDays } from '../table-schema'
import type { LogAttribute, LogData } from '../types'
import { sortByVal } from '../util/sort'
import { convertToMariaDBDateTime, convertToMariaDBInstant } from '../util/maria-ts'
import { NoDataError, NoTableError } from '../util/no-data-error'
import { flatMapFulfilled } from '../util/flat-map-fulfilled'

type Headers = {

    filters?: string
    "start-index"?: string
}

function evaluateParams(headers: Headers) {
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
            let value = filterParts.groups.value
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
                value = convertToMariaDBDateTime(value)
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
                params.push(value)
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
                params.push(`%${value}%`)
            } else {
                params.push(value)
            }
        }
    }

    //LIMIT 1  OFFSET ?
    //params.push(startIndex)
    sql += "ORDER BY `index` DESC "



    return {
        sql,
        params,
        hasIndexFilter
    }

}

export async function getLogs(url: URL, req: IncomingMessage, res: ServerResponse) {
    const headers = req.headers as Headers

    const queryData = evaluateParams(headers)

    await withPool(async pool => {
        const promises = generateForDays(7, async keys => {
            const connection = await pool.getConnection()
            extendWithReplacement(connection)
            try {

                const result = await connection.queryReplaced<Array<LogData>>(keys, queryData.sql, queryData.params)
                if (!result.length) {
                    throw new NoDataError()
                }
                let attributeSql = "SELECT * FROM LOG_ATTRIBUTES_TABLE WHERE log_id IN ( "
                let attributeParams: Array<number> = []
                attributeSql += result.map(r => ` ? `).join(",")

                const resultMap: Record<number, LogData> = {}
                for (const log of result) {
                    attributeParams.push(log.index)
                    resultMap[log.index] = log
                }


                const logAttributes = await connection.queryReplaced<Array<LogAttribute>>(keys, attributeSql + ")", attributeParams)

                for (const logAttr of logAttributes) {
                    resultMap[logAttr.log_id][logAttr.key] = logAttr.value
                }
                return result;
            } catch (e) {
                if (e instanceof NoDataError) {
                    throw e
                } else if (e.code === 'ER_NO_SUCH_TABLE') {
                    throw new NoTableError(e)
                } else {
                    debugger;
                    throw e;
                }
            } finally {
                connection.end()
            }
        })

        let logList: Array<LogData>

        if (queryData.hasIndexFilter) {
            logList = await Promise.any(promises)

        } else {
            const results = await Promise.allSettled(promises)
            logList = flatMapFulfilled(results)
                .sort(sortByVal(o => +o.timestamp))

        }
        res.write(JSON.stringify(logList, (k, v) => {
            if (typeof v == "bigint") {
                return Number(v)
            }
            return v
        }))
        res.end()
    })
}


