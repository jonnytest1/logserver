import moment = require('moment')

export function convertToMariaDBInstant(data: string | number | Date) {
    const date = new Date(data)
    return moment(+date).utc().format("Y-M-D H:m:s")
}
export function convertToMariaDBDateTime(data: string | number | Date) {
    const date = new Date(data)
    return moment(+date).utc().format("YYYY-MM-DD HH:mm:ss")
}