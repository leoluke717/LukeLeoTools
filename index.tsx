import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";

// Interfaces for type safety
interface Param {
  param_id: string;
  description: string;
  field_type: string;
  is_checked: number;
  key: string;
  not_null: number;
  value: string;
}

interface ResponseExample {
  example_id: string;
  raw: string;
  raw_parameter: Param[];
  expect: {
    code: string;
    name: string;
  };
}

interface ParsedData {
  name: string;
  method: string;
  url: string;
  requestParams: Param[];
  requestRaw: string;
  responses: ResponseExample[];
}

const ApiKeyModal = ({ isOpen, onClose, onSave }: { isOpen: boolean, onClose: () => void, onSave: (key: string) => void }) => {
  if (!isOpen) return null;

  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    // Pre-fill with existing key when modal opens
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) {
      setApiKey(savedKey);
    }
  }, [isOpen]);

  const handleSave = () => {
    if (!apiKey.trim()) {
      setError('API密钥不能为空。');
      return;
    }
    onSave(apiKey);
    setError('');
  };
  
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="apiKeyModalTitle">
        <button className="modal-close-button" onClick={onClose} aria-label="关闭">&times;</button>
        <h4 id="apiKeyModalTitle">设置Gemini API密钥</h4>
        <p className="helper-text">
            您的API密钥将仅保存在浏览器本地，不会上传到任何服务器。
            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer"> 获取密钥</a>
        </p>
        <div className="form-group">
            <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="在此输入您的 Gemini API Key"
                aria-label="Gemini API Key Input"
            />
        </div>
        <button onClick={handleSave} className="save-key-button">保存密钥</button>
        {error && <div className="error" role="alert" style={{marginTop: '1rem'}}>{error}</div>}
      </div>
    </div>
  );
};

const HomePage = ({ navigateTo }: { navigateTo: (page: string) => void }) => {
  const [isKeySaved, setIsKeySaved] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const checkKey = () => {
      const savedKey = localStorage.getItem('gemini_api_key');
      setIsKeySaved(!!savedKey);
    };
    checkKey();
    window.addEventListener('storage', checkKey);
    return () => window.removeEventListener('storage', checkKey);
  }, []);

  const handleSaveKey = (apiKey: string) => {
      localStorage.setItem('gemini_api_key', apiKey);
      setIsKeySaved(true);
      setIsModalOpen(false);
      window.dispatchEvent(new Event('storage'));
  };

  return (
    <div className="home-container">
      <div 
        className={`api-key-chip ${isKeySaved ? 'configured' : 'not-configured'}`}
        onClick={() => setIsModalOpen(true)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setIsModalOpen(true)}
        role="button"
        tabIndex={0}
        aria-label="API Key Settings"
      >
        {isKeySaved ? 'API密钥 ✓' : '设置API密钥'}
      </div>

      <h1>Luke的工具集</h1>
      <p className="subtitle">一个实用的开发者工具集合。</p>
      
      <div className="tool-grid">
        <div className="tool-card" onClick={() => navigateTo('json-parser')} role="button" tabIndex={0} aria-label="Go to JSON API Parser">
          <h3>JSON接口解析器</h3>
          <p>解析API JSON并生成基于Moya的Swift网络请求代码。</p>
        </div>
      </div>

      <ApiKeyModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSave={handleSaveKey}
      />
    </div>
  );
};


const JsonApiParser = ({ navigateTo }: { navigateTo: (page: string) => void }) => {
  const [jsonInput, setJsonInput] = useState('');
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [error, setError] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedSwiftCode, setGeneratedSwiftCode] = useState('');
  const [isKeyAvailable, setIsKeyAvailable] = useState(false);

  useEffect(() => {
    const checkApiKey = () => {
      const savedKey = localStorage.getItem('gemini_api_key');
      setIsKeyAvailable(!!savedKey);
    };
    checkApiKey();
    
    // Listen for storage changes to update key status in real-time
    window.addEventListener('storage', checkApiKey);
    return () => {
      window.removeEventListener('storage', checkApiKey);
    };
  }, []);

  const handleParse = () => {
    setGeneratedSwiftCode('');
    if (!jsonInput.trim()) {
      setError('JSON输入不能为空。');
      setParsedData(null);
      return;
    }
    try {
      const data = JSON.parse(jsonInput);
      
      // Sanitize URL
      let url = data?.url ?? '';
      const apiIndex = url.indexOf('/api');
      if (apiIndex !== -1) {
        url = url.substring(apiIndex);
      } else if (url.startsWith('api')) {
        url = `/${url}`;
      }
      const queryIndex = url.indexOf('?');
      if (queryIndex !== -1) {
        url = url.substring(0, queryIndex);
      }

      const method = data?.method?.toUpperCase() ?? '';
      const requestParams = method === 'GET'
        ? data?.request?.query?.parameter ?? []
        : data?.request?.body?.raw_parameter ?? [];
      
      const extractedData: ParsedData = {
        name: data?.name ?? '',
        method: data?.method ?? '',
        url: url,
        requestParams: requestParams,
        requestRaw: data?.request?.body?.raw ?? '',
        responses: data?.response?.example ?? [],
      };
      
      setParsedData(extractedData);
      setError('');
    } catch (e) {
      setError('无效的JSON格式。请检查输入。');
      setParsedData(null);
    }
  };
  
  const handleGenerateSwiftCode = async () => {
    if (!parsedData) return;
    setIsGenerating(true);
    setGeneratedSwiftCode('');
    setError('');

    const apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) {
      setError('请返回首页设置您的Gemini API密钥。');
      setIsGenerating(false);
      return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey: apiKey });
      const firstSuccessResponse = parsedData.responses.find(r => r.expect.code.startsWith('2'));

      const responseBodyParams = firstSuccessResponse
        ? firstSuccessResponse.raw_parameter.filter(p => p.key.startsWith('body.'))
        : [];
      
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const formattedDate = `${year}-${month}-${day}`;

      const prompt = `
You are an expert iOS developer specializing in writing clean, modern Swift code for networking using Moya. Your task is to generate a Swift file for an API request based on the provided JSON metadata.

Please adhere strictly to the following template and rules:

**Template:**
// ${parsedData.name}
//
//  <#Class#>.swift
//  NB-XK-iOS
//
//  Created by LB on ${formattedDate}.
//

import Foundation
import Moya

final class <#Class#>: BaseRequest {
 
    var withFile: [UploadFile]?
 
    var body: RequestType
 
    var provider: MoyaProvider<<#Class#>>!
 
    typealias RequestType = Request
 
    typealias ResponseType = Response
 
    var path: String {
        return "${parsedData.url}"
    }
 
    var method: Moya.Method {
        return .${parsedData.method.toLowerCase()}
    }
 
    init(body: RequestType) {
        self.body = body
    }
 
    // MARK: - Request
    struct Request: BaseModel {
        // 请求体参数在此处定义，生成后请移除此行。
    }
    
    // MARK: - Response
    struct Response: Codable {
        // 响应体参数在此处定义，生成后请移除此行。
    }

    // 如果请求或响应中包含嵌套结构体，请在此处定义，生成后请移除此行。
}


**Rules for Filling the Template:**

0.  **Context**: Assume \`Moya\` for networking and a custom \`BaseModel\` protocol for requests are available in the project.
1.  **<#Class#>: ** Based on the API title ("${parsedData.name}") and HTTP method ("${parsedData.method}"), generate a descriptive PascalCase class name. Use conventional prefixes like \`Get\`, \`Save\`, \`Create\`, \`Update\`, \`Edit\`, or \`Delete\` where appropriate. Append \`Request\` to the final name. For example, an API named "查询个人信息" (Query Personal Info) with method GET should become \`GetOwnInfoRequest\`.
2.  **Request Struct:**
    *   Populate with properties based on these request parameters: ${JSON.stringify(parsedData.requestParams, null, 2)}.
    *   For additional context and to create more descriptive comments, refer to this raw request body JSON example: ${parsedData.requestRaw || 'Not available'}.
    *   Each property must start with \`var\`.
    *   Each property must be an optional type (e.g., \`String?\`, \`Int?\`).
    *   Prepend each property with a Swift documentation comment (\`///\`) containing its description. If description is empty, omit the comment.
    *   Map JSON types to Swift types:
        *   \`string\`: \`String?\`
        *   \`number\`: If the key/description contains "price", "amount", "money", or "fee", use \`Decimal?\`. If it contains "time", "date", or "timestamp", use \`TimeInterval?\`. Otherwise, use \`Int?\`.
        *   \`boolean\`: \`Bool?\`
        *   \`array\`: \`[<#Type#>]?\`. Define a new struct for the object type within the array.
        *   \`object\`: \`<#CustomStructName#>?\`. Define a new struct for this object.
        *   \`null\`: Guess the type based on the parameter key (e.g., \`headImage\` could be \`String?\`) and make it optional.
    *   For nested objects or arrays of objects (e.g., \`user.name\` or \`contacts.phone\`), create separate \`struct\`s outside the \`Request\` struct but within the class file. Name them logically (e.g., \`User\`, \`Contact\`). The parent struct will then have a property like \`var contacts: [Contact]?\`.
3.  **Response Struct:**
    *   The \`Response\` struct should model **only the \`body\`** of the successful API response.
    *   Populate it using these response body parameters: ${JSON.stringify(responseBodyParams, null, 2)}.
    *   For additional context and to create more descriptive comments, refer to this raw successful response body JSON example: ${firstSuccessResponse?.raw || 'Not available'}.
    *   **Crucially, remove the 'body.' prefix from the keys when creating properties.** For example, a parameter with key \`body.data.accountId\` should result in a nested structure within the \`Response\` struct, ultimately leading to a property named \`accountId\`.
    *   The rules for properties, comments, and type mapping are identical to the \`Request\` struct.

Now, generate the complete Swift file as a single code block. Do not include any explanatory text before or after the code block.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      // Clean up the response to ensure it's just the code
      const code = response.text.replace(/^```swift\n?/, '').replace(/\n?```$/, '');
      setGeneratedSwiftCode(code);

    } catch (e) {
      console.error(e);
      let errorMessage = '生成Swift代码失败。请检查您的网络连接。';
      if (e instanceof Error && e.message.includes('API key not valid')) {
          errorMessage = 'API密钥无效或已过期，请返回首页更新密钥。';
          localStorage.removeItem('gemini_api_key');
          setIsKeyAvailable(false);
      }
      setError(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedSwiftCode).then(() => {
      // Optional: show a success message
    }).catch(err => {
      console.error('Failed to copy text: ', err);
    });
  };

  const handleFieldChange = (field: keyof Omit<ParsedData, 'requestParams' | 'responses' | 'requestRaw'>, value: string) => {
    if (!parsedData) return;
    setParsedData({ ...parsedData, [field]: value });
  };

  const handleParamChange = (
    updater: (newParams: Param[]) => void, 
    params: Param[], 
    index: number, 
    field: keyof Param, 
    value: string | number
  ) => {
    const newParams = [...params];
    const paramToUpdate = { ...newParams[index] };
    (paramToUpdate as any)[field] = value;
    newParams[index] = paramToUpdate;
    updater(newParams);
  };

  const handleRequestParamChange = (index: number, field: keyof Param, value: string | number) => {
    if (!parsedData) return;
    handleParamChange(
      (newRequestParams) => setParsedData({ ...parsedData, requestParams: newRequestParams }),
      parsedData.requestParams,
      index, field, value
    );
  };
  
  const handleResponseParamChange = (responseIndex: number, paramIndex: number, field: keyof Param, value: string | number) => {
    if (!parsedData) return;
    const newResponses = [...parsedData.responses];
    const responseToUpdate = { ...newResponses[responseIndex] };
    
    handleParamChange(
      (newParams) => {
        responseToUpdate.raw_parameter = newParams;
        newResponses[responseIndex] = responseToUpdate;
        setParsedData({ ...parsedData, responses: newResponses });
      },
      responseToUpdate.raw_parameter,
      paramIndex, field, value
    );
  };

  const renderParams = (params: Param[], onParamChange: (index: number, field: keyof Param, value: string | number) => void) => {
    if (!params || params.length === 0) {
      return <p className="no-params">未定义任何参数。</p>
    }
    return (
      <div className="params-list">
        {params.map((param, index) => {
          const indentation = (param.key.split('.').length - 1) * 20;
          return (
            <div key={param.param_id || index} className="param-item" style={{ marginLeft: `${indentation}px` }}>
              <input
                type="text"
                value={param.key}
                onChange={(e) => onParamChange(index, 'key', e.target.value)}
                aria-label="Parameter Key"
                className="param-input key"
                title={param.key}
              />
              <input
                type="text"
                value={param.field_type}
                onChange={(e) => onParamChange(index, 'field_type', e.target.value)}
                aria-label="Parameter Type"
                className="param-input type"
                title={param.field_type}
              />
              <input
                type="text"
                value={param.description}
                onChange={(e) => onParamChange(index, 'description', e.target.value)}
                aria-label="Parameter Description"
                className="param-input description"
                title={param.description}
              />
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="container">
      <button onClick={() => navigateTo('home')} className="back-button">← 返回工具集</button>
      <h1>JSON接口解析器</h1>
      <div className="form-group">
        <label htmlFor="json-input">在此处粘贴JSON</label>
        <textarea
          id="json-input"
          value={jsonInput}
          onChange={(e) => setJsonInput(e.target.value)}
          placeholder='在此处粘贴您的API JSON数据...'
          aria-label="JSON input text area"
        />
      </div>
      <button onClick={handleParse} disabled={isGenerating}>解析JSON</button>
      {error && <div className="error" role="alert">{error}</div>}
      
      {parsedData && (
        <div className="results-container">
          <h2>接口详情</h2>
          <div className="form-group">
            <label>标题</label>
            <input type="text" value={parsedData.name} onChange={(e) => handleFieldChange('name', e.target.value)}/>
          </div>
          <div className="api-meta-grid">
            <div className="form-group">
              <label>请求方法</label>
              <input type="text" value={parsedData.method} onChange={(e) => handleFieldChange('method', e.target.value)}/>
            </div>
            <div className="form-group">
              <label>地址</label>
              <input type="text" value={parsedData.url} onChange={(e) => handleFieldChange('url', e.target.value)}/>
            </div>
          </div>

          <h3>请求体参数</h3>
          {renderParams(parsedData.requestParams, handleRequestParamChange)}

          <h3>响应示例</h3>
          <div className="response-list">
            {parsedData.responses.map((res, index) => (
              <div key={res.example_id || index} className="response-item">
                <h4>{res.expect.name} (状态: {res.expect.code})</h4>
                {renderParams(res.raw_parameter, (paramIndex, field, value) => 
                  handleResponseParamChange(index, paramIndex, field, value)
                )}
              </div>
            ))}
          </div>
          
          <div className="generation-container">
              <button onClick={handleGenerateSwiftCode} disabled={isGenerating || !isKeyAvailable} className="generate-button" title={!isKeyAvailable ? '请先返回首页设置API密钥' : ''}>
                  {isGenerating ? '生成中...' : '生成Swift代码'}
              </button>
              {isGenerating && <div className="loader"></div>}
              {!isKeyAvailable && <p className="key-missing-notice">请返回首页设置API密钥以启用此功能。</p>}
          </div>

          {generatedSwiftCode && (
            <div className="code-container">
                <h3>已生成的Swift代码</h3>
                <div className="code-block-wrapper">
                    <button onClick={copyToClipboard} className="copy-button" aria-label="Copy code to clipboard">复制</button>
                    <pre><code>{generatedSwiftCode}</code></pre>
                </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
};


const App = () => {
  const [currentPage, setCurrentPage] = useState('home');

  const navigateTo = (page: string) => {
    setCurrentPage(page);
    window.scrollTo(0, 0);
  };

  switch (currentPage) {
    case 'json-parser':
      return <JsonApiParser navigateTo={navigateTo} />;
    case 'home':
    default:
      return <HomePage navigateTo={navigateTo} />;
  }
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);