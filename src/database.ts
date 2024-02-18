import { Pool, createPool } from 'mariadb';
import { environment } from './environment';

export function createDbPool(database: string) {
    return createPool({
        host: environment.DB_HOST,
        port: environment.DB_PORT ? +environment.DB_PORT : 3306,
        user: environment.DB_USER,
        password: environment.DB_PASSWORD,
        database
    })
}



export async function withPool<T>(callback: (pool: Pool) => Promise<T>) {
    const pool = createDbPool("tpscript")
    try {
        await callback(pool)
    } finally {
        pool.end()
    }

}