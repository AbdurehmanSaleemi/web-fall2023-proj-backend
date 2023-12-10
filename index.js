import express from "express";
import cors from "cors";
import { run, supabase } from "./supabase.js";
import dotenv from "dotenv";
import { OpenAI } from "openai";
import fetch, { Headers, Request } from 'node-fetch';
global.fetch = fetch;
global.Headers = Headers;
global.Request = Request;
dotenv.config();

const app = express();

import {
    webhooks,
    get_stripe,
    get_stripe_list
} from "./controller/Stripe.js"
import { getPics } from "./test.js";

app.post('/stripe_webhooks', express.raw({ type: 'application/json' }), webhooks);
app.get('/stripe_webhooks', express.raw({ type: 'application/json' }), async (req, res) => {
    res.status(200).send("Hello World");
});

app.use(cors());
app.use(express.json());

app.post('/get_stripe', get_stripe);
app.post('/getpaymentlist', get_stripe_list);

const port = process.env.PORT || 3005;
const openai = new OpenAI(process.env.OPENAI_API_KEY);


const getYogaPlan = async (data) => {
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4-1106-preview",
            temperature: 0.1,
            messages: data,
            response_format: {"type": "json_object"}
        });
        return completion.choices[0].message.content
    }
    catch (err) {
        throw err;
    }
}

app.get("/", (req, res) => {
    res.send("<h1>Yoga Pose Generator</h1>");
});

let yoga_imgs = [];
yoga_imgs = await getPics();

app.post("/fetch_result", async (req, res) => {
    try {
        const { feeling, health, time, expertise, intensity, uuid } = req.body;
        console.log(feeling);
        const public_url = 'https://eblovvbhjbqqkeoyenxr.supabase.co/storage/v1/object/public/yoga_imgs/imgs/'
        console.log(feeling, health, time, expertise, intensity, uuid);
        const query = `I am feeling ${feeling} and have ${health}. I have ${time} time , i want to do ${intensity} intensity practice and my level of yoga practie is ${expertise}.
        `;

        const messagesArray = [
            {
                role: "system",
                content: `You are an AI-based expert yoga instructor tasked with generating a personalized yoga sequence instructional script in JSON format. The user inputs their feeling which is ${feeling}, health condition which is ${health}, desired duration (which could be 15, 30, 45 minutes, or any other duration), intensity is ${intensity}, and level of expertise is ${expertise}. 

                Create a Hatha yoga sequence that is safe and tailored to the user's needs with the following guidelines:
                
                - The total duration of the yoga sequence must strictly adhere to the user's input time. For example, if the input time is ${time}, the sequence should be designed to fit exactly within this timeframe.
                - Structure the sequence into sections: Opening Poses, Warmup Poses, Main Poses, and Cool Down Poses, concluding with Shavasana.
                - Begin with Sukhasana for 45 seconds in Opening Poses.
                - Allocate time for each pose within the categories proportionally to the total duration. Suggested distribution: 10% Opening Poses, 20% Warmup Poses, 50% Main Poses, 20% Cool Down Poses.
                - Pose duration: 1-2 minutes for beginners, 3-4 minutes for intermediate, longer for advanced. Relaxing or cool down poses can be held for longer.
                - Include a narratable instruction script for each pose and a single line on pose benefits.
                - Exclude asanas requiring props but allow the use of a wall.
                - Incorporate guidance to prevent exacerbation of health conditions.
                - Ensure Shavasana is the closing pose, without repetition in the sequence.
                
                For each pose, provide the following details in JSON format:
                - Pose Name
                - Duration (calculated based on the total sequence time and user's expertise level)
                - Instruction and benefits
                - Image source (if available in ${yoga_imgs} else use placeholder)
                Adjust pose durations if necessary to match the total time.
                
                Example Response format:
                {
                    “Opening Pose”: [{
                        “Pose”: “<Pose Name>“,
                        “Duration”: “<Time>“,
                        “Instruction”: “<Instruction> <benefits>“,
                        "src": ${public_url} if available else use placeholder
                    }],
                    ... (and so on for other categories)
                }
                    `
            },
            {
                role: "user",
                content: query
            }
        ]
        try {
            const plan = getYogaPlan(messagesArray);
            const randomId = Math.floor(Math.random() * 1000000000);
            plan.then(async (response) => {
                console.log(response);
                res.status(200).json({
                    output: JSON.parse(response),
                    id: randomId
                });

                await supabase.from("Chat").insert([{
                    id: randomId,
                    question: query,
                    feeling: feeling,
                    condition: health,
                    time: time,
                    expertise: expertise,
                    output: response,
                    uuid: uuid
                }])

                const { data, error } = await supabase.rpc("reduce_sequences_available", {
                    customer_id: uuid
                })
            });
        } catch (err) {
            console.log(err);
        }
    }
    catch (err) {
        console.log(err);
    }
});

app.post("/fetch_history", async (req, res) => {
    try {
        const { uuid } = req.body;
        const { data, error } = await supabase.rpc('get_history', { cust_uuid: uuid })
        if (error) {
            throw error;
        }
        return res.status(200).send(data);
    }
    catch (e) {
        i
        return res.status(404).send()
    }
})

app.listen(port, () => {
    console.log(`Example app listening at ${port}`);
});
