
import { IP2Location } from "ip2location-nodejs"
import { environment } from '../environment';
import { existsSync, statSync } from 'fs';
import { join } from 'path';
import { Open } from "unzipper"
import { rename } from 'fs/promises';

const ipLoc = new IP2Location()

let ipSecLoadPr: Promise<void> | null = null
const dbFile = join(environment.IP_DB_FOLDER, "ipdb.bin")
export async function initializeip2loc() {
    if (ipSecLoadPr) {
        return ipSecLoadPr
    }

    ipSecLoadPr = new Promise<void>(async (res, err) => {
        try {
            console.log("checking db file")
            if (!existsSync(dbFile)) {
                await downloadDb()
            }

            const dbStats = statSync(dbFile)

            const minValidData = Date.now() - (1000 * 60 * 60 * 24 * 30)
            if (+dbStats.mtime < minValidData) {
                await downloadDb()
            }

            ipLoc.open(dbFile)
            console.log("finished loading dbFile")
            res();
        } catch (e) {
            err(e)
        }
    })

    return ipSecLoadPr

}


async function downloadDb() {
    console.log("downloading database")
    const resp = await fetch(environment.IP_URL)
    const buffer = await resp.arrayBuffer()
    const dir = await Open.buffer(Buffer.from(buffer))
    await dir.extract({
        path: environment.IP_DB_FOLDER
    })
    const mainFile = dir.files.find(f => f.uncompressedSize > 20000)
    if (!mainFile?.path) {
        throw new Error("missing path for zip file or file not found")
    }
    await rename(join(environment.IP_DB_FOLDER, mainFile.path), dbFile)

}


export async function ip2loc(ip: string) {
    await initializeip2loc()

    const [lat, lon] = await Promise.all([
        ipLoc.getLatitudeAsync(ip),
        ipLoc.getLongitudeAsync(ip)
    ])
    return {
        lat,
        lon
    }
}

