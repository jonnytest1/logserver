import type { Pool } from 'mariadb';
import moment = require('moment');

export type TableNames = {
    log: string;
    logAttr: string;
}

type PoolExtension = {
    queryReplaced(tables: TableNames, sql: string, values?: any)
}
export type ExtendedPool = Pool & PoolExtension


export function getTableNames(minusDays: number): TableNames {
    const iterationDate = moment().subtract(minusDays, "days");
    const week = `${iterationDate.isoWeek()}`
    const postFix = `${iterationDate.year()}-${week.padStart(2, "0")}-${iterationDate.isoWeekday() - 1}`
    const logdbName = `log${postFix}`;
    const logAttrdbName = `log_attributes${postFix}`;

    return {
        log: logdbName,
        logAttr: logAttrdbName
    }
}

export function extendPool(pool: Pool & Partial<PoolExtension>): asserts pool is ExtendedPool {
    pool.queryReplaced = function (tables: TableNames, sql: string, values) {
        return pool.query(sql.replace(/LOG_TABLE/g, `\`${tables.log}\``)
            .replace(/LOG_ATTRIBUTES_TABLE/g, `\`${tables.logAttr}\``), values)
    }
}



export async function ensureTables(pool: ExtendedPool, postfix: TableNames) {
    const tables = await pool.query<Array<[string]>>({
        sql: "SHOW TABLES",
        rowsAsArray: true,
    })

    const tableSet = new Set(tables.map(r => r[0]))


    if (!tableSet.has(postfix.log)) {
        debugger
        await pool.queryReplaced(postfix, `
            CREATE TABLE LOG_TABLE (
                \`index\` BIGINT(20) NOT NULL DEFAULT nextval(\`tpscript\`.\`log_index_sequence\`),
                \`timestamp\` DATETIME NULL DEFAULT NULL,
                \`severity\` TINYTEXT NULL DEFAULT NULL COLLATE 'utf8mb4_general_ci',
                \`application\` TINYTEXT NULL DEFAULT NULL COLLATE 'utf8mb4_general_ci',
                \`message\` MEDIUMTEXT NULL DEFAULT NULL COLLATE 'utf8mb4_general_ci',
                \`checked\` TINYINT(4) NULL DEFAULT NULL,
                \`ip\` TINYTEXT NULL DEFAULT NULL COLLATE 'utf8mb4_general_ci',
                PRIMARY KEY (\`index\`) USING BTREE,
                INDEX \`severity\` (\`severity\`(255)) USING BTREE,
                INDEX \`application\` (\`application\`(255)) USING BTREE
            )
            COLLATE='utf8mb4_general_ci'
            ENGINE=InnoDB
            ;
        `)

        await pool.queryReplaced(postfix, `
            DROP PROCEDURE IF EXISTS insert_return_log;
            DELIMITER //
            CREATE PROCEDURE insert_return_log (ts DATETIME,severity TINYTEXT,app TINYTEXT,message MEDIUMTEXT,ip TINYTEXT)
                    BEGIN
                        INSERT INTO \`tpscript\`.LOG_TABLE (\`timestamp\`, \`severity\`, \`application\`, \`message\`,\`ip\`)
                            VALUES (ts, severity, app, message,ip);
                        SELECT LASTVAL(\`log_index_sequence\`);
                    END;
            //
            DELIMITER ;
        `)

    }

    if (!tableSet.has(postfix.logAttr)) {
        debugger
        await pool.queryReplaced(postfix, `
        CREATE TABLE LOG_ATTRIBUTES_TABLE (
            \`log_id\` BIGINT(20) NULL DEFAULT NULL,
            \`key\` TINYTEXT NULL DEFAULT NULL COLLATE 'utf8mb4_general_ci',
            \`value\` MEDIUMTEXT NULL DEFAULT NULL COLLATE 'utf8mb4_general_ci',
            INDEX \`key\` (\`key\`(255)) USING BTREE,
            INDEX \`log_id\` (\`log_id\`) USING BTREE
        )
        COLLATE='utf8mb4_general_ci'
        ENGINE=InnoDB
        `)
    }



}