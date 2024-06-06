export type LogData = {
    index: number
    timestamp: Date
    ip: string
    Severity: string
    message: string
    application: string

    chunk?: string
}

export type LogAttribute = {
    log_id: number,
    key: string,
    value: string
}
