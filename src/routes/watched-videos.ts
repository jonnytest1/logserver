import type { IncomingMessage, ServerResponse } from 'http';
import { ResponseCodeError } from '../util/response-code-error';
import { extendWithReplacement, generateForDays } from '../table-schema';
import { withPool } from '../database';
import type { LogData } from '../types';
import { loadAttributes } from '../load-attributes';
import { flatMapFulfilled } from '../util/flat-map-fulfilled';
import { NoTableError } from '../util/no-data-error';


type VideoLog = LogData & {
    msg_duration: string,
    msg_videoTime: string
}



export async function watchedVideos(url: URL, req: IncomingMessage, res: ServerResponse) {
    const query = url.searchParams

    if (!query.has("src")) {

        if (!query.has("channel")) {
            throw new ResponseCodeError(400, "Missing channel")
        }

        if (!query.has("title")) {
            throw new ResponseCodeError(400, "Missing title")
        }
    }


    let sql = `SELECT * FROM LOG_TABLE 
            WHERE message='video-action'`
    let params: Array<string> = []
    if (query.has("src")) {
        sql += `AND EXISTS(
            SELECT NULL
            FROM LOG_ATTRIBUTES_TABLE
            WHERE LOG_ATTRIBUTES_TABLE.log_id= LOG_TABLE.\`index\`
            AND (LOG_ATTRIBUTES_TABLE.\`key\`='url' OR LOG_ATTRIBUTES_TABLE.\`key\`='msg_videoPageUrl')
            AND LOG_ATTRIBUTES_TABLE.value LIKE ?
        )`
        params.push(query.get("src") as string)
    }

    if (query.has("channel")) {
        sql += `AND EXISTS(
                SELECT NULL
                FROM LOG_ATTRIBUTES_TABLE
                WHERE LOG_ATTRIBUTES_TABLE.log_id=LOG_TABLE.\`index\`
                AND LOG_ATTRIBUTES_TABLE.\`key\`='msg_video_channel'
                AND LOG_ATTRIBUTES_TABLE.value LIKE ?
            )`
        params.push(`%${query.get("channel")}%`)
    }
    if (query.has("title")) {
        sql += `AND EXISTS(
                SELECT NULL
                FROM LOG_ATTRIBUTES_TABLE
                WHERE LOG_ATTRIBUTES_TABLE.log_id=LOG_TABLE.\`index\`
                AND LOG_ATTRIBUTES_TABLE.\`key\`='msg_video_title'
                AND LOG_ATTRIBUTES_TABLE.value LIKE ?
            )`
        params.push(`%${query.get("title")}%`)
    }

    await withPool(async pool => {
        extendWithReplacement(pool)
        const data = generateForDays(7, async prefix => {
            try {
                const entries = await pool.queryReplaced<Array<VideoLog>>(prefix, sql, params)
                await loadAttributes(pool, entries, prefix)
                return entries
            } catch (e) {
                if (e.code === 'ER_NO_SUCH_TABLE') {
                    throw new NoTableError(e)
                } else {
                    debugger;
                    throw e;
                }
            } finally {
                // close something ?
            }
        })

        const results = await Promise.allSettled(data)
        const logList = flatMapFulfilled(results)
            .filter(log => {
                if (!log.msg_duration) {
                    return false
                }
                const duration = +log.msg_duration
                const time = +log.msg_videoTime

                if (time < duration * 0.05) {
                    return false
                }
                return true
            })

        res.write(JSON.stringify(logList, (k, v) => {
            if (typeof v == "bigint") {
                return Number(v)
            }
            return v
        }))
        res.end()
    })



}