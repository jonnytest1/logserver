import type { IncomingMessage, ServerResponse } from 'http';
import { ExtendedPool, TableNames, ensureTables, extendPool, getTableNames } from '../table-schema';
import { withPool } from '../database';
import type { LogData } from '../types';




async function insertIntoTable(pool: ExtendedPool, obj: Partial<LogData>, postfix: TableNames) {
    try {
        await ensureTables(pool, postfix)
        const logIdAr = await pool.query<[[[bigint]]]>({
            sql: "CALL insert_return_log(TIMESTAMP(?) ,? ,? ,?,?)",
            rowsAsArray: true
        }, [
            obj.timestamp,
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


        attrSql += Object.keys(obj).map(key => {
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
        return logId
    } catch (e) {
        debugger
        console.error(e)
        throw e;
    }
}



export async function insert(url: URL, req: IncomingMessage, res: ServerResponse) {

    let body: Array<Uint8Array> = []
    req.on("data", (chunk: Uint8Array) => {
        body.push(chunk)
    })
    req.on("end", async chunk => {
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

            if (!parsed.timestamp) {
                parsed.timestamp = new Date()
            } else if (typeof parsed.timestamp === "number") {
                const date = new Date(parsed.timestamp);
                if (isNaN(+date)) {
                    throw new Error("invalid date")
                }
                parsed.timestamp = date
            }

            if (!parsed.application) {
                res.writeHead(400)
                throw new Error("// missing key application")
            }
            if (!parsed.Severity) {
                res.writeHead(400)
                throw new Error("missing key Severity")
            }
            if (!parsed.message) {
                res.writeHead(400)
                throw new Error("missing key message")
            }

            await withPool(async pool => {
                extendPool(pool)
                const tablePostFix = getTableNames(0)

                const id = await insertIntoTable(pool, parsed as LogData, tablePostFix)

                res.write(`${id}`)

            })

        } catch (e) {
            debugger
            res.write(e.message)
        } finally {
            res.end()
        }
    })



    const logRecord = {}


}