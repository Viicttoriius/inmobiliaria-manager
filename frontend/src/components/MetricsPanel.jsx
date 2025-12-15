import React, { useState, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import { Brain, RefreshCw, TrendingUp, Users, Building2, DollarSign, Activity } from 'lucide-react';
import './MetricsPanel.css'; // Crearemos este archivo CSS después

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

const MetricsPanel = ({ properties, clients, API_URL }) => {
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [selectedModel, setSelectedModel] = useState('openai/gpt-4o-mini'); // Default eficiente
  const [timeRange, setTimeRange] = useState('all'); // all, month, year

  // --- CÁLCULO DE MÉTRICAS (Memoized) ---
  
  // 1. Estadísticas Generales
  const stats = useMemo(() => {
    const totalProperties = properties.length;
    const totalClients = clients.length;
    
    // Precio promedio
    const prices = properties
      .map(p => parseFloat(String(p.price).replace(/[^0-9.-]+/g,"")))
      .filter(p => !isNaN(p) && p > 0);
    const avgPrice = prices.length ? (prices.reduce((a, b) => a + b, 0) / prices.length) : 0;

    // Valor total cartera (aprox)
    const totalValue = prices.reduce((a, b) => a + b, 0);

    return { totalProperties, totalClients, avgPrice, totalValue };
  }, [properties, clients]);

  // 2. Distribución por Tipo de Propiedad
  const propertyTypeData = useMemo(() => {
    const counts = {};
    properties.forEach(p => {
      const type = p.property_type || 'Desconocido';
      counts[type] = (counts[type] || 0) + 1;
    });
    return Object.keys(counts).map(key => ({ name: key.charAt(0).toUpperCase() + key.slice(1), value: counts[key] }));
  }, [properties]);

  // 3. Distribución por Fuente (Portal)
  const sourceData = useMemo(() => {
    const counts = {};
    properties.forEach(p => {
      const source = p.source || 'Otro';
      counts[source] = (counts[source] || 0) + 1;
    });
    return Object.keys(counts).map(key => ({ name: key, value: counts[key] }));
  }, [properties]);

  // 4. Clientes por Interés
  const clientInterestData = useMemo(() => {
    const counts = {};
    clients.forEach(c => {
      const interest = c.interest || 'No especificado';
      counts[interest] = (counts[interest] || 0) + 1;
    });
    return Object.keys(counts).map(key => ({ name: key, value: counts[key] }));
  }, [clients]);

  // --- LÓGICA IA ---

  const handleAnalyze = async () => {
    setLoadingAnalysis(true);
    setAiAnalysis('');

    try {
      // Preparar resumen de datos para el prompt
      const dataSummary = {
        total_propiedades: stats.totalProperties,
        total_clientes: stats.totalClients,
        precio_promedio: stats.avgPrice,
        valor_cartera: stats.totalValue,
        tipos_propiedades: propertyTypeData,
        fuentes_captacion: sourceData,
        intereses_clientes: clientInterestData,
        top_municipios: properties.slice(0, 50).map(p => p.Municipality || 'N/A') // Muestra de ubicaciones
      };

      const response = await fetch(`${API_URL}/ai/analyze-metrics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: dataSummary,
          model: selectedModel
        })
      });

      const result = await response.json();
      if (result.success) {
        setAiAnalysis(result.analysis);
      } else {
        setAiAnalysis('❌ Error generando análisis: ' + (result.error || 'Error desconocido'));
      }
    } catch (error) {
      console.error('Error analyzing metrics:', error);
      setAiAnalysis('❌ Error de conexión al generar análisis.');
    } finally {
      setLoadingAnalysis(false);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
  };

  return (
    <div className="metrics-panel">
      {/* Header Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card-metric">
          <div className="icon-wrapper blue"><Building2 size={24} /></div>
          <div className="stat-content">
            <h3>Propiedades</h3>
            <p className="stat-value">{stats.totalProperties}</p>
          </div>
        </div>
        <div className="stat-card-metric">
          <div className="icon-wrapper green"><Users size={24} /></div>
          <div className="stat-content">
            <h3>Clientes</h3>
            <p className="stat-value">{stats.totalClients}</p>
          </div>
        </div>
        <div className="stat-card-metric">
          <div className="icon-wrapper yellow"><DollarSign size={24} /></div>
          <div className="stat-content">
            <h3>Precio Promedio</h3>
            <p className="stat-value">{formatCurrency(stats.avgPrice)}</p>
          </div>
        </div>
        <div className="stat-card-metric">
          <div className="icon-wrapper purple"><Activity size={24} /></div>
          <div className="stat-content">
            <h3>Valor Cartera</h3>
            <p className="stat-value">{formatCurrency(stats.totalValue)}</p>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="charts-grid">
        <div className="chart-container">
          <h3>Tipos de Propiedad</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={propertyTypeData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {propertyTypeData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-container">
          <h3>Fuentes de Captación</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={sourceData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="value" name="Propiedades" fill="#82ca9d" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        
        <div className="chart-container">
          <h3>Intereses de Clientes</h3>
           <ResponsiveContainer width="100%" height={300}>
            <BarChart data={clientInterestData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="name" type="category" width={100} />
              <Tooltip />
              <Legend />
              <Bar dataKey="value" name="Clientes" fill="#8884d8" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* AI Analysis Section */}
      <div className="ai-analysis-section">
        <div className="ai-header">
          <div className="title-group">
            <Brain size={24} className="ai-icon" />
            <h2>Análisis Estratégico IA</h2>
          </div>
          
          <div className="ai-controls">
            <select 
              value={selectedModel} 
              onChange={(e) => setSelectedModel(e.target.value)}
              className="model-select"
            >
              <option value="openai/gpt-4o-mini">GPT-4o Mini (Rápido)</option>
              <option value="openai/gpt-4o">GPT-4o (Preciso)</option>
              <option value="anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet</option>
              <option value="meta-llama/llama-3.1-70b-instruct">Llama 3.1 70B</option>
              <option value="google/gemini-flash-1.5">Gemini Flash 1.5</option>
              <option value="deepseek/deepseek-r1">DeepSeek R1</option>
            </select>
            
            <button 
              onClick={handleAnalyze} 
              className="analyze-btn"
              disabled={loadingAnalysis}
            >
              {loadingAnalysis ? (
                <>
                  <RefreshCw className="spin" size={18} /> Analizando...
                </>
              ) : (
                <>
                  <TrendingUp size={18} /> Generar Informe
                </>
              )}
            </button>
          </div>
        </div>

        {aiAnalysis && (
          <div className="ai-result animated-fade-in">
            <div className="markdown-content">
              {aiAnalysis.split('\n').map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MetricsPanel;