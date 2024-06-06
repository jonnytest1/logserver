import type { Connection, Pool } from 'mariadb';
import moment = require('moment');

export type TableNames = {
    log: string;
    logAttr: string;
}

type PoolExtension = {
    queryReplaced<T>(tables: TableNames, sql: string, values?: any): Promise<T>
}
export type ExtendedPool = Pool & PoolExtension


export function getTableNames(minusDays: number): TableNames {
    const iterationDate = moment().subtract(minusDays, "days");
    return getTableNamesFromMoment(iterationDate);
}

export function getTableNamesFromMoment(iterationDate: moment.Moment) {
    const week = `${iterationDate.isoWeek()}`;
    const postFix = `${iterationDate.year()}-${week.padStart(2, "0")}-${iterationDate.isoWeekday() - 1}`;
    const logdbName = `log${postFix}`;
    const logAttrdbName = `log_attributes${postFix}`;

    return {
        log: logdbName,
        logAttr: logAttrdbName
    };
}

export const LOG_TABLE = "LOG_TABLE"
export const LOG_ATTRIBUTES_TABLE = "LOG_ATTRIBUTES_TABLE"

export function extendWithReplacement<T extends Pool | Connection>(pool: T & Partial<PoolExtension>): asserts pool is T & PoolExtension {
    pool.queryReplaced = function <T>(tables: TableNames, sql: string, values) {
        return pool.query<T>(sql.replace(/LOG_TABLE/g, `\`${tables.log}\``)
            .replace(/LOG_ATTRIBUTES_TABLE/g, `\`${tables.logAttr}\``), values)
    }
}

export function generateForDays<T>(searchPastNDays, generator: ((name: TableNames, index: number) => Promise<T>)) {
    return new Array(searchPastNDays).fill(null).map((_, i) => {
        const dateStr = getTableNames(i)

        return generator(dateStr, i)
    })
}

/**
 * ALTER ALGORITHM = UNDEFINED 
 * DEFINER=`root`@`%` 
 * SQL SECURITY DEFINER VIEW `log_tables` AS 
 *      select `information_schema`.`TABLES`.`TABLE_NAME` AS `TABLE_NAME`,`information_schema`.`TABLES`.`TABLE_COMMENT` AS `TABLE_COMMENT` 
 *      from `information_schema`.`TABLES` 
 *      where `information_schema`.`TABLES`.`TABLE_SCHEMA` = 'tpscript' ;
 */


let locked = false;

export async function ensureTables(pool: ExtendedPool, postfix: TableNames) {
    while (locked) {
        await new Promise(res => setTimeout(res, 200))
    }
    locked = true
    console.log("locked")
    try {
        const tables = await pool.query<Array<{
            TABLE_NAME: string,
            TABLE_COMMENT: string
        }>>("SELECT * FROM log_tables WHERE TABLE_NAME in (?,?)", [postfix.log, postfix.logAttr])

        const tableSet = Object.fromEntries(tables.map(tabel => [tabel.TABLE_NAME, tabel.TABLE_COMMENT]))

        if (tableSet[postfix.log] === undefined) {
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
        }
        if (tableSet[postfix.log] !== "created PROCEDURE") {
            const connection = await pool.getConnection()
            try {
                extendWithReplacement(connection)
                await connection.query("DROP PROCEDURE IF EXISTS insert_return_log")
                await connection.queryReplaced(postfix, `
CREATE PROCEDURE insert_return_log (ts DATETIME,severity TINYTEXT,app TINYTEXT,message MEDIUMTEXT,ip TINYTEXT)
    BEGIN
        INSERT INTO \`tpscript\`.LOG_TABLE (\`timestamp\`, \`severity\`, \`application\`, \`message\`,\`ip\`) VALUES (ts, severity, app, message, ip);
        SELECT LASTVAL(\`log_index_sequence\`);
    END
`)
                await pool.queryReplaced(postfix, "ALTER TABLE `tpscript`.LOG_TABLE COMMENT = 'created PROCEDURE'; ")

            } finally {
                connection.end()
            }

        }


        await createLogAttributesTable(pool, tableSet, postfix)

    } finally {
        locked = false
        console.log("unset lock")
    }

}


async function createLogAttributesTable(pool: ExtendedPool, tableSet: Record<string, string>, postfix: TableNames) {
    if (tableSet[postfix.logAttr] === undefined) {
        debugger
        try {
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
        } catch (e: unknown) {
            if (e && typeof e == "object" && "message" in e && typeof e.message === "string" && e.message.includes("already exists")) {
                return
            }
            throw e;
        }
    }
}