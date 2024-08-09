import type { IncomingMessage, ServerResponse } from 'http';
import { readBody, sendBody } from '../util/request-uitls';
import moment = require('moment');
import { LOG_TABLE, extendWithReplacement, getTableNamesFromMoment } from '../table-schema';
import { withPool } from '../database';
import { loadAttributes } from '../load-attributes';
import type { LogData } from '../types';
import { convertToMariaDBDateTime } from '../util/maria-ts';
import { flatMapFulfilled } from '../util/flat-map-fulfilled';
import { sortByVal } from '../util/sort';
import { NoDataError, NoTableError } from '../util/no-data-error';
import { jsonStringify } from '../util/json-stringify';

export async function grafanaJsonConnection(url: URL, req: IncomingMessage, res: ServerResponse) {
    debugger
    res.writeHead(200)
}

interface MetricsRequest {
    metric?: string
}


export async function grafanaMetrics(url: URL, req: IncomingMessage, res: ServerResponse) {
    const body = await readBody(req)
    const metricData = JSON.parse(body.toString()) as MetricsRequest

    const metrics = [
        {
            name: "Severity",
            type: "select",
            label: "level",
            options: [{
                label: "DEBUG",
                value: "DEBUG"
            }, {
                label: "INFO",
                value: "INFO"
            }, {
                label: "WARNING",
                value: "WARNING"
            }, {
                label: "ERROR",
                value: "ERROR"
            }]
        }
    ]
    sendBody(res, JSON.stringify([{
        value: "Logs",
        payloads: metrics
    }, {
        value: "Access",
        payloads: []
    }] satisfies Array<{ value: Target, payloads: Array<unknown> }>))

}
type Target = "Logs" | "Access";

interface QueryRequest {
    range: {
        from: string,
        to: string
    }
    targets: Array<{
        target: Target,
        payload: Record<string, string>
    }>
}

export async function grafanaQuery(url: URL, req: IncomingMessage, res: ServerResponse) {
    const body = await readBody(req)
    const queryData = JSON.parse(body.toString()) as QueryRequest

    const target = queryData.targets[0]
    const tableDates: Array<moment.Moment> = []

    const start = moment(new Date(queryData.range.from))
    const end = moment(new Date(queryData.range.to))
    tableDates.push(start)
    let iterate = start.clone().add(1, "days")
    while (iterate <= end) {
        tableDates.push(iterate)
        iterate = iterate.clone().add(1, "days")
    }
    const results = await withPool(async pool => {
        extendWithReplacement(pool)
        return await Promise.allSettled(tableDates.map(getTableNamesFromMoment).map(async tables => {

            const connection = await pool.getConnection()
            extendWithReplacement(connection)
            try {

                if (target.target === "Logs") {
                    let sql = `SELECT * FROM ${LOG_TABLE} WHERE timestamp > ? AND timestamp < ?`
                    const params: Array<string | Array<string>> = [convertToMariaDBDateTime(queryData.range.from), convertToMariaDBDateTime(queryData.range.to)]
                    if (target.payload.Severity) {
                        sql += " AND Severity IN (?)"
                        if (target.payload.Severity === "ERROR") {
                            params.push(["ERROR"])
                        } else if (target.payload.Severity === "WARNING") {
                            params.push(["ERROR", "WARN", "WARNING"])
                        } else {
                            debugger
                        }

                    }
                    const result = await connection.queryReplaced<Array<LogData>>(tables, sql, params)
                    for (const log of result) {
                        log.chunk = tables.log
                    }
                    await loadAttributes(pool, result, tables)
                    return result
                } else if (target.target == "Access") {
                    let sql = `SELECT * FROM ${LOG_TABLE} WHERE timestamp > ? AND timestamp < ? AND message='access' AND severity='INFO'`
                    const params: Array<string | Array<string>> = [convertToMariaDBDateTime(queryData.range.from), convertToMariaDBDateTime(queryData.range.to)]

                    const result = await connection.queryReplaced<Array<LogData>>(tables, sql, params)

                    await loadAttributes(pool, result, tables)
                    for (const log of result) {
                        log.chunk = tables.log
                    }
                    return result
                } else {
                    throw new Error("invalid target type")
                }
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
        }))
    })
    const finishedREsults = flatMapFulfilled(results)
        .sort(sortByVal(o => +o.timestamp))



    const columns: Record<string, string> = {}

    for (const log of finishedREsults) {
        log["level"] = log["severity"]
        log["summary"] = `${log.application}: ${log.message}`
        for (const key in log) {
            columns[key] = typeof log[key]
            if (typeof log[key] !== "bigint" && !isNaN(+new Date(log[key]))) {
                columns[key] = "time"
            }
        }

    }
    const columnList = Object.keys(columns).sort((key1, key2) => {
        if (key1 == "summary") {
            return -1
        }
        if (key2 == "summary") {
            return 1
        }
        return 0
    })
    const result = [{
        target: target.target,
        type: "table",
        columns: columnList.map(column => ({
            text: column,
            type: columns[column]
        })),
        rows: finishedREsults.map(log => {
            const data = new Array(columnList.length).fill(undefined)
            for (const key in log) {
                data[columnList.indexOf(key)] = log[key]
            }
            return data
        })

    }]


    sendBody(res, jsonStringify(result))

}

export async function grafanaMetricOpts(url: URL, req: IncomingMessage, res: ServerResponse) {
    debugger
}