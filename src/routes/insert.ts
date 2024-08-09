import type { IncomingMessage, ServerResponse } from 'http';
import { ExtendedPool, LOG_TABLE, TableNames, ensureTables, extendWithReplacement, generateForDays, getTableNames } from '../table-schema';
import { withPool } from '../database';
import type { LogData } from '../types';
import moment = require('moment');
import { convertToMariaDBDateTime, convertToMariaDBInstant } from '../util/maria-ts';
import { ResponseCodeError } from '../util/response-code-error';
import { readBody } from '../util/request-uitls';
import { initializeip2loc, ip2loc } from '../util/ip-to-location';
import { loadAttributes } from '../load-attributes';
import { flatMapFulfilled } from '../util/flat-map-fulfilled';
import { sortByVal } from '../util/sort';

async function insertIntoTable<T extends Partial<LogData>>(pool: ExtendedPool, obj: T, postfix: TableNames) {

    await ensureTables(pool, postfix)

    const time = convertToMariaDBInstant(obj.timestamp!)

    const logIdAr = await pool.query<[[[bigint]]]>({
        sql: "CALL insert_return_log(TIMESTAMP(?) ,? ,? ,?,?)",
        rowsAsArray: true
    }, [
        time,
        obj.Severity?.toUpperCase(),
        obj.application,
        obj.message,
        obj.ip
    ])
    const logId = Number(logIdAr[0][0][0])


    delete obj.timestamp
    delete obj.Severity
    delete obj.application
    delete obj.message
    delete obj.ip

    let attrSql = 'INSERT INTO LOG_ATTRIBUTES_TABLE (log_id,`key`,`value`) VALUES '
    const params: Array<number | string> = []

    const remainingKeys = Object.keys(obj);
    if (remainingKeys.length) {
        attrSql += remainingKeys.map(key => {
            params.push(logId)
            params.push(key)
            if (obj[key] instanceof Array) {
                params.push(JSON.stringify(obj[key]))
            } else {
                params.push(obj[key])
            }

            return " (? , ? , ?) "
        }).join(",")
        await pool.queryReplaced(postfix, attrSql, params)
    }
    return logId
}
initializeip2loc()
export async function insertAccess(url: URL, req: IncomingMessage, res: ServerResponse) {
    const body = await readBody(req)
    const bodyData = body.toString()

    const location = await ip2loc(bodyData)
    if (location.lat === "INVALID_IP_ADDRESS") {
        insertChecked({
            application: "nginx",
            message: "error getting ip",
            data: bodyData,
            Severity: "ERROR",
            lat: location.lat,
            lon: location.lon
        })
    }

    const id = await insertChecked({
        application: "nginx",
        message: "access",
        data: bodyData,
        Severity: "INFO",
        lat: location.lat,
        lon: location.lon
    });


    await withPool(async pool => {
        extendWithReplacement(pool)
        const promises = generateForDays(3, async keys => {
            let sql = `SELECT * FROM ${LOG_TABLE} WHERE message='access' AND severity='INFO'`
            const params: Array<string | Array<string>> = []

            const result = await pool.queryReplaced<Array<LogData>>(keys, sql, params)
            await loadAttributes(pool, result, keys)
            return result
        })
        const results = await Promise.allSettled(promises)
        const logList = flatMapFulfilled(results)
            .filter(log => log["lon"] == "INVALID_IP_ADDRESS")
            .sort(sortByVal(o => +o.timestamp))

        for (const log of logList) {
            if (log["data"]) {
                const location = await ip2loc(log["data"])
                if (location.lat !== "INVALID_IP_ADDRESS") {
                    debugger;
                    if (log.chunk?.includes("log")) {
                        const attrChunk = log.chunk.replace("log", "log_attributes")
                        await pool.query(`UPDATE \`${attrChunk}\` SET \`value\`= ? WHERE log_id = ? AND \`key\`='lat'`, [location.lat, log.index])
                        await pool.query(`UPDATE \`${attrChunk}\` SET \`value\`= ? WHERE log_id = ? AND \`key\`='lon'`, [location.lon, log.index])
                    }

                } else {
                    console.error("got invalid ip ")
                }
            }
        }
    })

}

export async function insert(url: URL, req: IncomingMessage, res: ServerResponse) {
    return new Promise<void>((resolver, err) => {
        let body: Array<Uint8Array> = []
        req.on("data", (chunk: Uint8Array) => {
            body.push(chunk)
        })
        req.on("end", async ev => {

            let b64Decoded
            try {
                const requestData = Buffer.concat(body).toString("utf8")
                b64Decoded = Buffer.from(requestData, "base64").toString()

                const parsed = JSON.parse(b64Decoded) as {
                    ip?: string,
                    timestamp?: string | number | Date,
                    application?: string
                    Severity?: LogData["Severity"]
                    message?: string
                }


                const headers = req.headers as {
                    HTTP_X_FORWARDED_FOR?: string
                    REMOTE_ADDR?: string
                }
                parsed["user-agent"] = headers["user-agent"]
                if (headers.HTTP_X_FORWARDED_FOR && typeof headers.HTTP_X_FORWARDED_FOR == "string") {
                    parsed.ip = headers.HTTP_X_FORWARDED_FOR;
                } else if (req.socket?.remoteAddress) {
                    parsed.ip = req.socket?.remoteAddress;
                }

                const id = await insertChecked(parsed);
                res.write(`${id}`);
                resolver()
            } catch (e) {
                e.b64DecodedData = b64Decoded
                err(e)
            }
        })

    })
}

export async function insertChecked<T extends Partial<LogData & { timestamp }>>(parsed: T) {
    if (!parsed.timestamp) {
        parsed.timestamp = new Date();
    } else if (typeof parsed.timestamp === "number") {
        const date = new Date(parsed.timestamp);
        if (isNaN(+date)) {
            throw new Error("invalid date");
        }
        parsed.timestamp = date;
    }

    if (!parsed.application) {
        throw new ResponseCodeError(400, "// missing key application");
    }
    if (!parsed.Severity) {
        throw new ResponseCodeError(400, "missing key Severity");
    }
    if (!parsed.message) {
        throw new ResponseCodeError(400, "missing key message");
    }

    console.log("new log entry:", parsed.message);
    return await withPool(async (pool) => {
        extendWithReplacement(pool);
        const tablePostFix = getTableNames(0);

        return insertIntoTable(pool, parsed as LogData, tablePostFix);
    });
}
