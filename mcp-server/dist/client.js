"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listContracts = listContracts;
exports.getContract = getContract;
exports.createMeasurement = createMeasurement;
exports.submitMeasurement = submitMeasurement;
exports.uploadDocument = uploadDocument;
exports.getMeasurementStatus = getMeasurementStatus;
const form_data_1 = __importDefault(require("form-data"));
const fs_1 = require("fs");
const path_1 = require("path");
const BASE_URL = process.env.PORTALDCP_URL || 'https://portaldcp.com.br';
const API_KEY = process.env.PORTALDCP_API_KEY || '';
if (!API_KEY) {
    process.stderr.write('[portaldcp-mcp] AVISO: PORTALDCP_API_KEY não definida\n');
}
async function apiFetch(path, options = {}) {
    const url = `${BASE_URL}/api/ext/v1${path}`;
    const headers = {
        'X-Api-Key': API_KEY,
        ...(options.headers || {}),
    };
    if (options.body && typeof options.body === 'string') {
        headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
        let errMsg = `HTTP ${res.status}`;
        try {
            const err = await res.json();
            errMsg = err.message || err.error || JSON.stringify(err);
        }
        catch {
            errMsg = await res.text();
        }
        throw new Error(`Erro na API Portal DCP: ${errMsg}`);
    }
    const text = await res.text();
    if (!text)
        return {};
    return JSON.parse(text);
}
async function listContracts() {
    return apiFetch('/contratos');
}
async function getContract(contractId) {
    return apiFetch(`/contratos/${contractId}`);
}
async function createMeasurement(contractId, dados) {
    return apiFetch(`/contratos/${contractId}/medicoes`, {
        method: 'POST',
        body: JSON.stringify(dados),
    });
}
async function submitMeasurement(measurementId) {
    return apiFetch(`/medicoes/${measurementId}/enviar`, { method: 'POST' });
}
async function uploadDocument(measurementId, filePath, tipo, descricao) {
    if (!(0, fs_1.existsSync)(filePath)) {
        throw new Error(`Arquivo não encontrado: ${filePath}`);
    }
    const form = new form_data_1.default();
    form.append('file', (0, fs_1.createReadStream)(filePath), { filename: (0, path_1.basename)(filePath) });
    form.append('tipo', tipo);
    if (descricao)
        form.append('descricao', descricao);
    const url = `${BASE_URL}/api/ext/v1/medicoes/${measurementId}/documentos`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'X-Api-Key': API_KEY,
            ...form.getHeaders(),
        },
        body: form.getBuffer(),
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Erro no upload: ${errText}`);
    }
    return res.json();
}
async function getMeasurementStatus(measurementId) {
    return apiFetch(`/medicoes/${measurementId}`);
}
//# sourceMappingURL=client.js.map