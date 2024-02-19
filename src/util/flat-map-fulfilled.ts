import { NoDataError, NoTableError } from './no-data-error';

export function flatMapFulfilled<T>(array: Array<PromiseSettledResult<Array<T>>>) {
    return array
        .filter((res): res is PromiseFulfilledResult<Array<T>> => {
            if (res.status === "rejected" && typeof res.reason == "object") {
                if (res.reason instanceof NoTableError || res.reason instanceof NoDataError) {
                    return false
                }
                throw res.reason
            }
            return res.status === "fulfilled";
        })
        .flatMap(res => res.value)
}