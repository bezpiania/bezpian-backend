import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import { encodingForModel } from 'js-tiktoken';
import DocumentChunk from '../../models/DocumentChunk.js';
import Document from '../../models/Document.js';

let pdfjsLib = null;
const getPdfLib = async () => {
  if (!pdfjsLib) {
    pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = '';
  }
  return pdfjsLib;
};

const enc = encodingForModel('gpt-3.5-turbo');
const CHUNK_TOKEN_LIMIT = 500;
const OVERLAP_TOKENS = 50;

class DocumentProcessor {
  /**
   * Extrae texto de un PDF
   */
  async extractTextFromPDF(filePath) {
    try {
      const pdfjs = await getPdfLib();
      const pdf = await pdfjs.getDocument(filePath).promise;
      let text = '';

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        text += `\n[Página ${i}]\n${pageText}`;
      }

      return text;
    } catch (error) {
      console.error('Error extracting PDF:', error);
      throw new Error(`No se pudo procesar el PDF: ${error.message}`);
    }
  }

  /**
   * Extrae texto de un DOCX
   */
  async extractTextFromDOCX(filePath) {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;
    } catch (error) {
      console.error('Error extracting DOCX:', error);
      throw new Error(`No se pudo procesar el DOCX: ${error.message}`);
    }
  }

  /**
   * Extrae texto de un TXT
   */
  async extractTextFromTXT(filePath) {
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch (error) {
      console.error('Error extracting TXT:', error);
      throw new Error(`No se pudo procesar el TXT: ${error.message}`);
    }
  }

  /**
   * Extrae texto según el tipo de archivo
   */
  async extractText(filePath, mimeType) {
    if (mimeType === 'application/pdf') {
      return await this.extractTextFromPDF(filePath);
    } else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword'
    ) {
      return await this.extractTextFromDOCX(filePath);
    } else if (mimeType === 'text/plain') {
      return await this.extractTextFromTXT(filePath);
    } else {
      throw new Error(`Tipo de archivo no soportado: ${mimeType}`);
    }
  }

  /**
   * Cuenta tokens en un texto
   */
  countTokens(text) {
    try {
      const tokens = enc.encode(text);
      return tokens.length;
    } catch (error) {
      console.error('Error counting tokens:', error);
      return Math.ceil(text.length / 4); // Aproximación: 1 token ~= 4 caracteres
    }
  }

  /**
   * Divide el texto en chunks
   */
  createChunks(text, overlapTokens = OVERLAP_TOKENS) {
    const chunks = [];
    const paragraphs = text.split('\n\n').filter(p => p.trim());

    let currentChunk = '';
    let currentTokens = 0;

    for (const para of paragraphs) {
      const paraTokens = this.countTokens(para);

      // Si agregar este párrafo supera el límite, guarda el chunk actual
      if (currentTokens + paraTokens > CHUNK_TOKEN_LIMIT && currentChunk) {
        chunks.push(currentChunk.trim());
        // Overlap: mantener los últimos párrafos para contexto
        const overlapParagraphs = currentChunk
          .split('\n\n')
          .slice(-Math.ceil(overlapTokens / (paraTokens || 1)))
          .join('\n\n');
        currentChunk = overlapParagraphs + '\n\n' + para;
        currentTokens = this.countTokens(currentChunk);
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + para;
        currentTokens += paraTokens;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Procesa un documento completo
   */
  async processDocument(documentId, chatbotId, workspaceId, filePath, mimeType, originalFilename) {
    try {
      console.log(`📄 Procesando documento ${documentId}...`);

      // 0. Guardar archivo localmente
      const uploadsDir = path.join(process.cwd(), 'uploads', 'documents');
      const filename = `${documentId}${path.extname(originalFilename || filePath)}`;
      const savedPath = path.join(uploadsDir, filename);

      fs.copyFileSync(filePath, savedPath);
      const fileUrl = `/uploads/documents/${filename}`;
      console.log(`✅ Archivo guardado: ${fileUrl}`);

      // 1. Extraer texto
      const text = await this.extractText(filePath, mimeType);
      console.log(`✅ Texto extraído: ${text.length} caracteres`);

      // 2. Crear chunks
      const chunks = this.createChunks(text);
      console.log(`✅ Chunks creados: ${chunks.length}`);

      // 3. Guardar chunks en MongoDB
      const savedChunks = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const tokenCount = this.countTokens(chunk);

        const docChunk = new DocumentChunk({
          documentId,
          chatbotId,
          workspaceId,
          chunkIndex: i,
          text: chunk,
          tokenCount,
          metadata: {
            sourceFile: originalFilename || path.basename(filePath),
            pageNumber: null
          }
        });

        await docChunk.save();
        savedChunks.push(docChunk._id);
      }

      console.log(`✅ ${savedChunks.length} chunks guardados en MongoDB`);

      // 4. Actualizar estado del documento con URL local
      await Document.findByIdAndUpdate(documentId, {
        status: 'ready',
        totalChunks: chunks.length,
        processedAt: new Date(),
        localUrl: fileUrl
      });

      console.log(`✅ Documento ${documentId} marcado como ready`);

      return {
        success: true,
        chunkCount: chunks.length,
        totalTokens: chunks.reduce((sum, chunk) => sum + this.countTokens(chunk), 0),
        fileUrl
      };
    } catch (error) {
      console.error('❌ Error procesando documento:', error);

      // Actualizar documento con error
      await Document.findByIdAndUpdate(documentId, {
        status: 'failed',
        errorMessage: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default new DocumentProcessor();
