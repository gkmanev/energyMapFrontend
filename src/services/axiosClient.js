import axios from 'axios'

const getServerElapsedMs = (response) => {
  if (!response) {
    return null
  }

  return (
    response.data?.server_elapsed_ms ??
    response.data?.server_elapsed_time ??
    response.headers?.server_elapsed_ms ??
    response.headers?.server_elapsed_time ??
    response.headers?.['server_elapsed_ms'] ??
    response.headers?.['server_elapsed_time'] ??
    null
  )
}

const logServerElapsedMs = (response) => {
  const serverElapsedMs = getServerElapsedMs(response)

  if (serverElapsedMs !== null) {
    console.log('server_elapsed_ms:', serverElapsedMs)
  }
}

axios.interceptors.response.use(
  (response) => {
    logServerElapsedMs(response)
    return response
  },
  (error) => {
    logServerElapsedMs(error?.response)
    return Promise.reject(error)
  }
)

export default axios
