
import { createClient } from "redis"

const client = createClient({
    url : "rediss://default:gQAAAAAAAkeHAAIgcDExY2YwYTdkY2E2OTg0YTRiYmNkNWZmZWNjMzUzYWJkYg@saved-lion-149383.upstash.io:6379"
})

client.connect()
    .then(async ()=> {
        while(1) {
            await client.rPop()
        }
    })

