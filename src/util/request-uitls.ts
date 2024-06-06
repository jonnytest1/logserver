import type { IncomingMessage, ServerResponse } from 'http'

export function readBody(req: IncomingMessage) {
    return new Promise<Buffer>(res => {
        let body: Array<Uint8Array> = []
        req.on("data", (chunk: Uint8Array) => {
            body.push(chunk)
        })
        req.on("end", async ev => {
            res(Buffer.concat(body))
        })
    })

}

export function sendBody(res: ServerResponse, body: string) {
    const responseBuffer = Buffer.from(body)
    const headers = {
        'Content-Type': "application/json",
        'Content-Length': responseBuffer.byteLength
    }
    res.writeHead(200, headers).write(responseBuffer)
}
