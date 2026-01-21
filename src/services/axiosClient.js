import axios from 'axios'

axios.interceptors.response.use(
  (response) => {
    const serverElapsedMs = response?.data?.server_elapsed_ms

    if (serverElapsedMs !== undefined) {
      console.log('server_elapsed_ms:', serverElapsedMs)
    }

    return response
  },
  (error) => {
    const serverElapsedMs = error?.response?.data?.server_elapsed_ms

    if (serverElapsedMs !== undefined) {
      console.log('server_elapsed_ms:', serverElapsedMs)
    }

    return Promise.reject(error)
  }
)

export default axios
