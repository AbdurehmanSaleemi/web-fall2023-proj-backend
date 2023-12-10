import dotenv from "dotenv";
import { SupabaseVectorStore } from "langchain/vectorstores/supabase";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { createClient } from "@supabase/supabase-js";
import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { makeChain } from "./makechain.js";

import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
dotenv.config();

const privateKey = process.env.SUPABASE_PRIVATE_KEY;
if (!privateKey) throw new Error(`Expected env var SUPABASE_PRIVATE_KEY`);

const url = process.env.SUPABASE_URL;
if (!url) throw new Error(`Expected env var SUPABASE_URL`);

export const supabase = createClient(url,privateKey)

export const run = async (query, filename) => {
    let loader = null;
    let docs = null;
    const client = createClient(url, privateKey);
    if (filename !== null) {
        try {
            loader = new PDFLoader(`./uploads/${filename}`);
            docs = await loader.load();

            const splitter = new RecursiveCharacterTextSplitter({
                chunkSize: 1500,
                chunkOverlap: 200,
            });
            
            const docOutput = await splitter.splitDocuments(docs);
             // check if there is unicode in the text
            const regex = /[\u{0080}-\u{FFFF}]/gu
            for(let i=0; i < docOutput.length; i++){
                if(regex.test(docOutput[i].pageContent)){
                    console.log(docOutput[i].pageContent);
                    docOutput[i].text = docOutput[i].pageContent.replace(regex, '');
                }
            }
            //console.log(docOutput);

            const vectorStore = await SupabaseVectorStore.fromDocuments(
                docOutput,
                new OpenAIEmbeddings(),
                {
                    client,
                    tableName: "documents",
                    queryName: "match_documents",
                }
            );
            return 1;
        } catch (err) {
            console.log(err);
        }
    }

    if (query !== null) {
        console.log("Query: ", query);
        const vectorStore = await SupabaseVectorStore.fromExistingIndex(
            new OpenAIEmbeddings(),
            {
                client,
                tableName: "documents",
                queryName: "match_documents",
            }
        );
        const response = await vectorStore.similaritySearch(
            query, 10)
        console.log(response);
        const chain = makeChain(vectorStore)
        const result = await chain.call({
            question: query,
            context: docs,
            chat_history: [],
        });
        return result
    }
    return null;
};