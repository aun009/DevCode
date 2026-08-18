
import express, { response } from "express";
import redis, { createClient } from "redis";

const app = express();

const client = createClient({
    url : "rediss://default:gQAAAAAAAkeHAAIgcDExY2YwYTdkY2E2OTg0YTRiYmNkNWZmZWNjMzUzYWJkYg@saved-lion-149383.upstash.io:6379",
});

app.use(express.json());
await client.connect();

app.post("/submission", async (req, res)=> {
    await client.lPush("problems", "1")

    res.json({
        message : "processing"
    })
}) 

// app.get("/submission/:submissionId", (req, res)=> {

// })

app.listen(3000);