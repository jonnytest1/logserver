import type { IncomingMessage, ServerResponse } from 'http';
import { ExtendedPool, TableNames, ensureTables, extendWithReplacement, getTableNames } from '../table-schema';
import { withPool } from '../database';
import type { LogData } from '../types';
import moment = require('moment');
import { convertToMariaDBInstant } from '../util/maria-ts';
import { ResponseCodeError } from '../util/response-code-error';

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

export async function insert(url: URL, req: IncomingMessage, res: ServerResponse) {
    return new Promise<void>((resolver, err) => {
        let body: Array<Uint8Array> = []
        req.on("data", (chunk: Uint8Array) => {
            body.push(chunk)
        })
        req.on("end", async ev => {
            try {
                const requestData = Buffer.concat(body).toString("utf8")
                const b64Decoded = Buffer.from(requestData, "base64").toString()

                const parsed = JSON.parse(b64Decoded) as {
                    ip?: string,
                    timestamp?: string | number | Date,
                    application?: string
                    Severity?: string
                    message?: string
                }


                const headers = req.headers as {
                    HTTP_X_FORWARDED_FOR?: string
                    REMOTE_ADDR?: string
                }

                if (headers.HTTP_X_FORWARDED_FOR && typeof headers.HTTP_X_FORWARDED_FOR == "string") {
                    parsed.ip = headers.HTTP_X_FORWARDED_FOR;
                } else if (req.socket?.remoteAddress) {
                    parsed.ip = req.socket?.remoteAddress;
                }

                const id = await insertChecked(parsed);
                res.write(`${id}`);
                resolver()
            } catch (e) {
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

    console.log("new log entry", parsed.message);
    return await withPool(async (pool) => {
        extendWithReplacement(pool);
        const tablePostFix = getTableNames(0);

        return insertIntoTable(pool, parsed as LogData, tablePostFix);
    });
}
