const fetch = require('node-fetch');
const FormData = require('form-data');
const Busboy = require('busboy');

const parseMultipartForm = (event) => {
    return new Promise((resolve, reject) => {
        try {
            if (!event.headers || !event.headers['content-type']) {
                throw new Error('Cabeçalho Content-Type em falta ou inválido.');
            }
            const busboy = Busboy({ headers: event.headers });
            const fields = {};
            const files = {};

            busboy.on('file', (fieldname, file, { filename, encoding, mimeType }) => {
                const chunks = [];
                file.on('data', (chunk) => chunks.push(chunk));
                file.on('end', () => {
                    files[fieldname] = {
                        filename,
                        content: Buffer.concat(chunks),
                        contentType: mimeType
                    };
                });
                 file.on('error', err => {
                     console.error('Erro no stream do ficheiro:', err);
                     reject(new Error(`Erro ao ler o ficheiro: ${err.message}`));
                 });
            });

            busboy.on('field', (fieldname, val) => {
                fields[fieldname] = val;
            });

            busboy.on('close', () => {
                resolve({ fields, files });
            });

            busboy.on('error', err => {
                 console.error('Erro do Busboy:', err);
                 reject(new Error(`Erro ao processar form-data: ${err.message}`));
            });
            
            if (!event.body) {
                 throw new Error('Corpo da requisição está vazio.');
            }

            // =======================================================
            // ## A CORREÇÃO ESTÁ AQUI (v1.0.9) ##
            // =======================================================
            // Em vez de criar um novo buffer, passamos a string
            // e a codificação correta diretamente para o busboy.
            
            if (event.isBase64Encoded) {
                const requestBodyBuffer = Buffer.from(event.body, 'base64');
                busboy.end(requestBodyBuffer);
            } else {
                // Passa a string e a codificação 'binary' (latin1)
                busboy.end(event.body, 'binary');
            }

        } catch (error) {
             console.error('Erro geral no parseMultipartForm:', error);
             reject(new Error(`Erro interno ao processar formulário: ${error.message}`));
        }
    });
};

exports.handler = async (event) => {
    // Permite CORS
    const origin = event.headers.origin || "*";
    const headers = {
        'Access-Control-Allow-Origin': origin, 
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: 'Método não permitido' };
    }

    try {
        const { files } = await parseMultipartForm(event);
        const imageFile = files['images'];

        if (!imageFile || !imageFile.content || imageFile.content.length === 0) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nenhuma imagem enviada ou imagem vazia.' }) };
        }

        const apiKey = process.env.PLANTNET_API_KEY; 
        if (!apiKey) {
             console.error("Erro Crítico: Variável de ambiente PLANTNET_API_KEY não definida no Netlify.");
             return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erro de configuração do servidor (chave API em falta).' }) };
        }

        const apiUrl = `https://my-api.plantnet.org/v2/identify/all?api-key=${apiKey}&lang=pt`;
        
        const formData = new FormData();
        formData.append('organs', 'leaf');
        formData.append('images', imageFile.content, { filename: imageFile.filename || 'upload.jpg', contentType: imageFile.contentType || 'image/jpeg' });

        const plantnetResponse = await fetch(apiUrl, {
            method: 'POST',
            body: formData,
            headers: formData.getHeaders()
        });

        const data = await plantnetResponse.json();

        if (!plantnetResponse.ok) {
             console.error('Erro da API PlantNet:', plantnetResponse.status, data);
             const errorMessage = data.message || `Erro ${plantnetResponse.status} do PlantNet`;
             return { statusCode: plantnetResponse.status, headers, body: JSON.stringify({ error: errorMessage }) };
        }

        console.log("Resposta do PlantNet recebida com sucesso.");
        return {
            statusCode: 200,
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify(data)
        };

    } catch (error) {
        console.error("Erro na função Netlify identify:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: `Falha interna no servidor: ${error.message}` })
        };
    }
};