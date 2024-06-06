import type { ExtendedPool, TableNames } from './table-schema';
import type { LogAttribute, LogData } from './types';

export async function loadAttributes(pool: ExtendedPool, logs: Array<LogData>, keys: TableNames) {

    if (logs.length == 0) {
        return logs
    }

    let attributeSql = "SELECT * FROM LOG_ATTRIBUTES_TABLE WHERE log_id IN ( "
    let attributeParams: Array<number> = []
    attributeSql += logs.map(r => ` ? `).join(",")

    const resultMap: Record<number, LogData> = {}
    for (const log of logs) {
        attributeParams.push(log.index)
        resultMap[log.index] = log
    }


    const logAttributes = await pool.queryReplaced<Array<LogAttribute>>(keys, attributeSql + ")", attributeParams)

    for (const logAttr of logAttributes) {
        resultMap[logAttr.log_id][logAttr.key] = logAttr.value
    }
    return logs;
}