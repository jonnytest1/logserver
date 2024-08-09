export type LogData = {
    index: number
    timestamp: Date
    ip: string
    Severity: "ERROR" | "INFO" | "WARN" | "DEBUG"
    message: string
    application: string

    chunk?: string
}

export type LogAttribute = {
    log_id: number,
    key: string,
    value: string
}
