

export class ResponseCodeError extends Error {

    constructor(public status: number, message: string) {
        super(message)
    }
}