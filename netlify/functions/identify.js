// ===================================================================
// ## IDENTIFY.JS - VERSÃO FINAL (LÊ A CHAVE DO AMBIENTE) ##
// ===================================================================

const fetch = require('node-fetch');
const FormData = require('form-data');
const Busboy = require('busboy');

// Função para tratar o upload de ficheiros multipart/form-data
const parseMultipartForm = (event) => {
    return new Promise((resolve, reject) => {
        try {
            // Verifica se headers existem e se content-type está presente
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
                // Adiciona tratamento de erro para o stream do ficheiro
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
            
            // Converte o corpo da requisição (que pode estar em base64) para buffer
            // Garante que event.body existe antes de tentar converter
            if (!event.body) {
                 throw new Error('Corpo da requisição está vazio.');
            }
            const requestBodyBuffer = Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'binary');
            busboy.end(requestBodyBuffer);

        } catch (error) {
             console.error('Erro geral no parseMultipartForm:', error);
             reject(new Error(`Erro interno ao processar formulário: ${error.message}`));
        }
    });
};

exports.handler = async (event) => {
    // Permite CORS
    const origin = event.headers.origin || "*"; // Permite a origem ou todas para teste
    const headers = {
        'Access-Control-Allow-Origin': origin, 
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    // Responde a OPTIONS
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers };
    }

    // Processa POST
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: 'Método não permitido' };
    }

    try {
        const { files } = await parseMultipartForm(event); // Não precisamos mais do apiKey dos 'fields'
        const imageFile = files['images'];

        if (!imageFile || !imageFile.content || imageFile.content.length === 0) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nenhuma imagem enviada ou imagem vazia.' }) };
        }

        // ## ALTERAÇÃO CRUCIAL: Lê a chave das variáveis de ambiente ##
        const apiKey = process.env.PLANTNET_API_KEY; 
        if (!apiKey) {
             console.error("Erro Crítico: Variável de ambiente PLANTNET_API_KEY não definida no Netlify.");
             return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erro de configuração do servidor (chave API em falta).' }) };
        }

        // Pede os resultados em Português
        const apiUrl = `https://my-api.plantnet.org/v2/identify/all?api-key=${apiKey}&lang=pt`;
        
        const formData = new FormData();
        formData.append('organs', 'leaf'); // Pode ajustar se necessário
        formData.append('images', imageFile.content, { filename: imageFile.filename || 'upload.jpg', contentType: imageFile.contentType || 'image/jpeg' });

        const plantnetResponse = await fetch(apiUrl, {
            method: 'POST',
            body: formData,
            headers: formData.getHeaders() // Importante para multipart/form-data com node-fetch@2
        });

        const data = await plantnetResponse.json();

        // Verifica se a resposta do PlantNet foi OK
        if (!plantnetResponse.ok) {
             console.error('Erro da API PlantNet:', plantnetResponse.status, data);
             // Tenta retornar a mensagem de erro do PlantNet, se houver
             const errorMessage = data.message || `Erro ${plantnetResponse.status} do PlantNet`;
             return { statusCode: plantnetResponse.status, headers, body: JSON.stringify({ error: errorMessage }) };
        }

        console.log("Resposta do PlantNet recebida com sucesso.");
        return {
            statusCode: 200,
            headers: { ...headers, "Content-Type": "application/json" }, // Garante o Content-Type correto
            body: JSON.stringify(data)
        };

    } catch (error) {
        console.error("Erro na função Netlify identify:", error);
        return {
            statusCode: 500,
            headers, // Inclui cabeçalhos CORS no erro também
            body: JSON.stringify({ error: `Falha interna no servidor: ${error.message}` })
        };
    }
};