export class NoDataError extends Error {
    constructor() {
        super("no data")
    }
}

export class NoTableError extends Error {
    constructor(e) {
        super("no table", e)
    }
}