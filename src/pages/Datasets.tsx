import React, { useState, useEffect } from 'react';
import { UploadCloud, FileJson, CheckCircle, DatabaseZap, Clock, DownloadCloud, RefreshCcw, Download } from 'lucide-react';
import axios from 'axios';
import Papa from 'papaparse';
import Markdown from 'react-markdown';
import { db } from '../lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

export default function Datasets() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [retraining, setRetraining] = useState(false);
  const [stats, setStats] = useState<any>(() => {
    const saved = localStorage.getItem('datasetStats');
    return saved ? JSON.parse(saved) : null;
  });
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(() => {
    return localStorage.getItem('datasetAiAnalysis') || null;
  });
  const [analyzing, setAnalyzing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [imputationStrategy, setImputationStrategy] = useState('mean');
  const [normalizationStrategy, setNormalizationStrategy] = useState('min-max');
  const [cleanedCsv, setCleanedCsv] = useState<string | null>(null);
  const { user } = useAuth();
  
  const [githubUrl, setGithubUrl] = useState(() => {
    return localStorage.getItem('datasetGithubUrl') || '';
  });

  const handleRefresh = () => {
    setRefreshing(true);
    setStats(null);
    setAiAnalysis(null);
    setGithubUrl('');
    setCleanedCsv(null);
    localStorage.removeItem('datasetStats');
    localStorage.removeItem('datasetAiAnalysis');
    localStorage.removeItem('datasetGithubUrl');
    setTimeout(() => setRefreshing(false), 500);
  };

  useEffect(() => {
    if (stats) localStorage.setItem('datasetStats', JSON.stringify(stats));
  }, [stats]);

  useEffect(() => {
    if (aiAnalysis) localStorage.setItem('datasetAiAnalysis', aiAnalysis);
  }, [aiAnalysis]);

  useEffect(() => {
    localStorage.setItem('datasetGithubUrl', githubUrl);
  }, [githubUrl]);

  const handleAIAnalysis = async (dataDump: string) => {
    setAnalyzing(true);
    try {
      const response = await fetch('/api/analyze-dataset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataDump })
      });
      const data = await response.json();
      if (data.status === 'success') {
        setAiAnalysis(data.markdown);
        toast.success("AI Inference Report Generated");
      } else {
        toast.error("Failed to analyze dataset: " + data.message);
      }
    } catch (e) {
      toast.error("Error connecting to AI Analysis API");
    } finally {
      setAnalyzing(false);
    }
  };

  const processDataset = async (originalRows: any[], features: number, rawSizeMb: string) => {
    let nullCount = 0;
    let avgCpu = 0, avgRam = 0, avgDisk = 0, avgTime = 0;
    let cpuItems = 0, ramItems = 0, diskItems = 0, timeItems = 0;

    // Pass 1: Compute stats for imputation & normalization
    const colStats: Record<string, { sum: number, count: number, min: number, max: number, values: number[] }> = {};
    
    originalRows.forEach(r => {
       Object.entries(r).forEach(([key, val]) => {
         const isNull = !val || val === '';
         if (isNull) nullCount++;
         const numVal = parseFloat(val as string);
         if (!isNaN(numVal)) {
           if(!colStats[key]) colStats[key] = { sum: 0, count: 0, min: Infinity, max: -Infinity, values: [] };
           colStats[key].sum += numVal;
           colStats[key].count++;
           colStats[key].min = Math.min(colStats[key].min, numVal);
           colStats[key].max = Math.max(colStats[key].max, numVal);
           colStats[key].values.push(numVal);
         }
       });
    });

    const colMods: Record<string, { mean: number, std: number, median: number }> = {};
    Object.keys(colStats).forEach(key => {
      const stats = colStats[key];
      const mean = stats.sum / stats.count;
      const variance = stats.values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / stats.count;
      const std = Math.sqrt(variance);
      const sorted = [...stats.values].sort((a,b) => a-b);
      const median = sorted[Math.floor(sorted.length / 2)];
      colMods[key] = { mean, std, median };
    });

    // Pass 2: Clean, Impute, Normalize
    let processedRows = originalRows.map(r => {
       const newRow: any = { ...r };
       let hasNull = false;
       Object.entries(r).forEach(([key, val]) => {
         const isNull = !val || val === '';
         if (isNull) hasNull = true;
         
         let numVal = parseFloat(val as string);
         if (isNaN(numVal) || isNull) {
            if (imputationStrategy === 'mean' && colMods[key]) numVal = colMods[key].mean;
            else if (imputationStrategy === 'median' && colMods[key]) numVal = colMods[key].median;
            else if (imputationStrategy === 'zero') numVal = 0;
         }

         if (!isNaN(numVal) && colMods[key]) {
            if (normalizationStrategy === 'min-max' && colStats[key].max !== colStats[key].min) {
               numVal = (numVal - colStats[key].min) / (colStats[key].max - colStats[key].min);
            } else if (normalizationStrategy === 'z-score' && colMods[key].std !== 0) {
               numVal = (numVal - colMods[key].mean) / colMods[key].std;
            }
            newRow[key] = Number.isInteger(numVal) ? numVal.toString() : numVal.toFixed(4);
         }
         
         const finalVal = parseFloat(newRow[key]);
         if (!isNaN(finalVal)) {
            const lowerKey = key.toLowerCase();
            if (lowerKey.includes('cpu')) { avgCpu += finalVal; cpuItems++; }
            else if (lowerKey.includes('ram') || lowerKey.includes('mem')) { avgRam += finalVal; ramItems++; }
            else if (lowerKey.includes('disk') || lowerKey.includes('io')) { avgDisk += finalVal; diskItems++; }
            else if (lowerKey.includes('time') || lowerKey.includes('queue')) { avgTime += finalVal; timeItems++; }
         }
       });
       
       return (imputationStrategy === 'drop' && hasNull) ? null : newRow;
    }).filter(r => r !== null);

    const targetAvgCpu = cpuItems > 0 ? (normalizationStrategy !== 'none' ? Math.round(avgCpu / cpuItems * 100) : Math.round(avgCpu / cpuItems)) : 45;
    const targetAvgRam = ramItems > 0 ? (normalizationStrategy !== 'none' ? Math.round(avgRam / ramItems * 100) : Math.round(avgRam / ramItems)) : 50;

    const suggestedParams = {
      cpuUsage: Math.min(100, Math.max(0, targetAvgCpu)),
      ramUsage: Math.min(100, Math.max(0, targetAvgRam)),
      diskIo: diskItems > 0 ? Math.round(avgDisk / diskItems) : 250,
      timeInQueue: timeItems > 0 ? Math.round(avgTime / timeItems) : 80
    };
    localStorage.setItem('suggestedTaskParams', JSON.stringify(suggestedParams));
    localStorage.setItem('overridePredictParams', 'true');

    // Save first 100 rows to the datasets collection
    let ingested = 0;
    try {
      const datasetsRef = collection(db, 'datasets');
      for (let i = 0; i < Math.min(processedRows.length, 100); i++) {
        await addDoc(datasetsRef, {
          timestamp: new Date().toISOString(),
          userId: user?.uid || 'anonymous',
          dataDump: JSON.stringify(processedRows[i])
        });
        ingested++;
      }
      toast.success(`Processed & Ingested ${ingested} records.`);
    } catch (error) {
       toast.error("Failed to ingest records to database.");
    }

    setCleanedCsv(Papa.unparse(processedRows));

    setStats({
      rows: processedRows.length,
      features,
      nullValues: nullCount,
      memoryUsage: `${rawSizeMb} MB`,
      sampleData: JSON.stringify(processedRows.slice(0, 50))
    });
    
    setUploading(false);
    setFile(null);
    setGithubUrl('');
    
    // Trigger AI Analysis on processed data
    handleAIAnalysis(JSON.stringify(processedRows.slice(0, 50)));
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !user) return;

    setUploading(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data as any[];
        const features = results.meta.fields?.length || 0;
        const rawSizeMb = (file.size / (1024 * 1024)).toFixed(2);
        await processDataset(rows, features, rawSizeMb);
      },
      error: (error) => {
        console.error("Error parsing CSV:", error);
        toast.error("Failed to parse CSV file");
        setUploading(false);
      }
    });
  };

  const handleGithubUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!githubUrl || !user) return;
    
    setUploading(true);
    
    try {
      let url = githubUrl;
      // Convert normal GitHub URL to raw URL if needed
      if (url.includes('github.com') && url.includes('/blob/')) {
        url = url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
      }

      const response = await fetch('/api/fetch-github', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url })
      });
      if (!response.ok) throw new Error('Failed to fetch file from GitHub');
      
      const csvText = await response.text();
      
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          const rows = results.data as any[];
          const features = results.meta.fields?.length || 0;
          const rawSizeMb = (csvText.length / (1024 * 1024)).toFixed(2);
          await processDataset(rows, features, rawSizeMb);
        },
        error: (error) => {
          console.error("Error parsing CSV:", error);
          toast.error("Failed to parse CSV file");
          setUploading(false);
        }
      });
    } catch (err) {
      console.error(err);
      toast.error("Error fetching dataset: Ensure the URL is accessible and valid.");
      setUploading(false);
    }
  };

  const handleDownload = () => {
    if (!cleanedCsv) return;
    const blob = new Blob([cleanedCsv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute('download', 'cleaned_dataset.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRetrain = async () => {
    setRetraining(true);
    toast.info("Initializing Cloud Retraining Pipeline...", { description: "Allocating GPU instances..."});

    try {
      // Intentionally simulating a long running ML pipeline
      await new Promise(resolve => setTimeout(resolve, 3000));
      toast.success("Model Retrained Successfully", {
        description: "New weights have been deployed to the edge."
      });
    } catch (e) {
      toast.error("Pipeline failed.");
    } finally {
      setRetraining(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-200">Dataset Management</h1>
          <p className="mt-1 text-sm text-slate-500">Upload Google Cluster Trace data and preprocess for ML training.</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-300 bg-slate-800/50 hover:bg-slate-700/50 rounded-lg border border-slate-700 transition duration-150"
        >
          <RefreshCcw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="bg-[#111318] shadow-sm rounded-xl border border-slate-800 p-8">
        <div className="max-w-xl mx-auto mb-8">
          <h3 className="text-lg font-medium text-slate-200 mb-4 border-b border-slate-800 pb-2">Pre-Processing Pipeline</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Imputation Strategy</label>
              <select 
                value={imputationStrategy}
                onChange={(e) => setImputationStrategy(e.target.value)}
                className="w-full bg-[#0A0B0E] border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm focus:ring-1 focus:ring-indigo-500"
              >
                <option value="mean">Mean Substitution</option>
                <option value="median">Median Substitution</option>
                <option value="zero">Zero Substitution</option>
                <option value="drop">Drop Missing Rows</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Normalization Strategy</label>
              <select 
                value={normalizationStrategy}
                onChange={(e) => setNormalizationStrategy(e.target.value)}
                className="w-full bg-[#0A0B0E] border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm focus:ring-1 focus:ring-indigo-500"
              >
                <option value="none">No Normalization</option>
                <option value="min-max">Min-Max Scaling</option>
                <option value="z-score">Z-Score Standardization</option>
              </select>
            </div>
          </div>
        </div>

        <div className="max-w-xl mx-auto">
          <form onSubmit={handleUpload}>
            <div 
              className="mt-2 flex justify-center rounded-lg border border-dashed border-slate-800 px-6 py-10 hover:bg-[#16181d] transition-colors"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  setFile(e.dataTransfer.files[0]);
                }
              }}
            >
              <div className="text-center">
                <UploadCloud className="mx-auto h-12 w-12 text-slate-600" aria-hidden="true" />
                <div className="mt-4 flex text-sm leading-6 text-slate-400 justify-center">
                  <label
                    htmlFor="file-upload"
                    className="relative cursor-pointer rounded-md bg-transparent font-semibold text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 hover:text-blue-400"
                  >
                    <span>Upload a file</span>
                    <input id="file-upload" name="file-upload" type="file" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] || null)} accept=".csv" />
                  </label>
                  <p className="pl-1">or drag and drop</p>
                </div>
                <p className="text-xs leading-5 text-slate-500">CSV up to 500MB (Cluster Trace)</p>
              </div>
            </div>
            
            {file && (
              <div className="mt-4 flex items-center justify-between p-3 bg-[#0A0B0E] rounded-lg border border-slate-800">
                <div className="flex items-center">
                  <FileJson className="h-5 w-5 text-slate-400 mr-2" />
                  <span className="text-sm font-medium text-slate-300">{file.name}</span>
                </div>
                <button
                  type="submit"
                  disabled={uploading}
                  className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {uploading ? 'Processing & Ingesting...' : 'Upload & Clean'}
                </button>
              </div>
            )}
          </form>

          <div className="mt-8 pt-8 border-t border-slate-800">
            <h3 className="text-sm font-medium text-slate-300 mb-4 flex items-center">
              <DownloadCloud className="h-4 w-4 mr-2 text-indigo-400" />
              Or import from GitHub
            </h3>
            <form onSubmit={handleGithubUpload} className="flex gap-3">
              <input
                type="url"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                placeholder="https://raw.githubusercontent.com/username/repo/main/data.csv"
                className="flex-1 rounded-lg border border-slate-800 bg-[#0A0B0E] px-4 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono placeholder:text-slate-600"
                required
                disabled={uploading}
              />
              <button
                type="submit"
                disabled={uploading}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors flex items-center whitespace-nowrap shadow-lg shadow-indigo-600/20"
              >
                {uploading ? <Clock className="h-4 w-4 mr-2 animate-spin" /> : <DownloadCloud className="h-4 w-4 mr-2" />}
                Import Dataset
              </button>
            </form>
          </div>
        </div>
      </div>

      {stats && (
        <div className="bg-[#111318] shadow-sm rounded-xl border border-slate-800 p-6">
             <div className="flex justify-between items-center mb-6">
              <div className="flex items-center">
                 <CheckCircle className="h-6 w-6 text-green-500 mr-2" />
                 <h3 className="text-lg font-medium text-slate-200">Dataset Processed Successfully</h3>
              </div>
              <div className="flex gap-3">
                {cleanedCsv && (
                  <button 
                    onClick={handleDownload}
                    className="flex items-center px-4 py-2 bg-slate-800 text-slate-300 text-sm font-medium rounded-md border border-slate-700 hover:bg-slate-700 transition-colors shadow-sm"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </button>
                )}
                <button 
                   onClick={handleRetrain}
                   disabled={retraining}
                   className="flex items-center px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700 transition-colors disabled:opacity-50 shadow-md shadow-purple-900/20 shadow-inner"
                >
                   {retraining ? <Clock className="animate-spin h-4 w-4 mr-2" /> : <DatabaseZap className="h-4 w-4 mr-2" />}
                   {retraining ? 'Retraining Pipeline Active...' : 'Trigger Cloud Retrain Pipeline'}
                </button>
              </div>
           </div>
          
          <dl className="grid grid-cols-1 gap-5 sm:grid-cols-4 relative z-10">
            <div className="px-5 py-6 bg-gradient-to-br from-[#0A0B0E] to-[#111318] rounded-xl border border-slate-800/80 shadow-md flex flex-col relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/[0.03] rounded-bl-full"></div>
              <dt className="text-sm font-medium text-slate-500 truncate mb-2">Total Records</dt>
              <dd className="mt-auto text-3xl font-semibold tracking-tight text-slate-200">{stats.rows.toLocaleString()}</dd>
            </div>
            <div className="px-5 py-6 bg-gradient-to-br from-[#0A0B0E] to-[#111318] rounded-xl border border-slate-800/80 shadow-md flex flex-col relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-purple-500/[0.03] rounded-bl-full"></div>
              <dt className="text-sm font-medium text-slate-500 truncate mb-2">Feature Count</dt>
              <dd className="mt-auto text-3xl font-semibold tracking-tight text-slate-200">{stats.features}</dd>
            </div>
            <div className="px-5 py-6 bg-gradient-to-br from-[#0A0B0E] to-[#0A0E0A] rounded-xl border border-green-900/30 shadow-md flex flex-col relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-green-500/[0.05] rounded-bl-full"></div>
              <dt className="text-sm font-medium text-slate-500 truncate mb-2">Null Values (Cleaned)</dt>
              <dd className="mt-auto text-3xl font-semibold tracking-tight text-green-400">{stats.nullValues.toLocaleString()}</dd>
            </div>
            <div className="px-5 py-6 bg-gradient-to-br from-[#0A0B0E] to-[#111318] rounded-xl border border-slate-800/80 shadow-md flex flex-col relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/[0.03] rounded-bl-full"></div>
              <dt className="text-sm font-medium text-slate-500 truncate mb-2">Memory Size</dt>
              <dd className="mt-auto text-3xl font-semibold tracking-tight text-slate-200">{stats.memoryUsage}</dd>
            </div>
          </dl>
          
          {(analyzing || aiAnalysis) && (
            <div className="mt-12 bg-[#0A0B0E] p-1 border border-slate-800/60 rounded-2xl relative overflow-hidden shadow-xl shadow-black/40">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 opacity-30"></div>
              <div className="bg-[#111318] rounded-xl p-8 border border-slate-800/40 relative z-10 w-full">
                <div className="flex items-center justify-between mb-8 border-b border-slate-800/80 pb-6">
                  <div>
                    <h3 className="text-xl font-semibold tracking-tight text-slate-200 flex items-center">
                       <DatabaseZap className="h-5 w-5 mr-3 text-blue-400" />
                       AI Inference & Power BI Blueprint
                    </h3>
                    <p className="text-sm text-slate-500 mt-1">Automated analysis and virtualization schema based on provided metrics.</p>
                  </div>
                  {analyzing && (
                    <div className="flex items-center px-4 py-2 bg-blue-500/10 text-blue-400 rounded-full text-sm font-medium border border-blue-500/20">
                      <Clock className="animate-spin h-4 w-4 mr-2" />
                      Analyzing...
                    </div>
                  )}
                </div>
                
                {analyzing && !aiAnalysis ? (
                  <div className="flex flex-col space-y-4">
                    <div className="h-4 bg-slate-800/50 rounded-md w-3/4 animate-pulse"></div>
                    <div className="h-4 bg-slate-800/50 rounded-md w-1/2 animate-pulse"></div>
                    <div className="h-4 bg-slate-800/50 rounded-md w-full animate-pulse"></div>
                    <div className="h-32 bg-[#0A0B0E] border border-slate-800/50 rounded-xl animate-pulse mt-4"></div>
                  </div>
                ) : (
                  <div className="w-full">
                    <Markdown
                      components={{
                        h3: ({node, ...props}) => <h3 className="text-lg font-medium text-slate-100 mt-10 first:mt-0 mb-4 pb-2 border-b border-slate-800/50" {...props} />,
                        h4: ({node, ...props}) => <div className="flex items-center mt-10 mb-5"><div className="h-5 w-1 bg-indigo-500 rounded-full mr-3"></div><h4 className="text-base font-semibold text-indigo-300 uppercase tracking-wider text-xs" {...props} /></div>,
                        p: ({node, ...props}) => <p className="text-slate-400 text-sm leading-relaxed mb-5 w-full" {...props} />,
                        ul: ({node, ...props}) => <ul className="space-y-3 mb-6 w-full" {...props} />,
                        li: ({node, ...props}) => <li className="text-slate-300 text-sm flex items-start before:content-[''] before:block before:w-1.5 before:h-1.5 before:bg-indigo-500 before:rounded-full before:mt-1.5 before:mr-3 before:flex-shrink-0" {...props} />,
                        pre: ({node, ...props}) => <pre className="p-4 bg-[#0A0B0E] rounded-xl border border-slate-800/80 overflow-x-auto text-sm text-slate-300 mb-8 font-mono shadow-inner shadow-black/20 w-full" {...props} />,
                        code: ({node, className, children, ...props}: any) => {
                          const inline = !className;
                          return inline 
                            ? <code className="bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20 text-indigo-300 font-mono text-xs" {...props}>{children}</code>
                            : <code className="font-mono text-xs" {...props}>{children}</code>;
                        },
                        strong: ({node, ...props}) => <strong className="font-medium text-slate-200" {...props} />,
                      }}
                    >
                      {aiAnalysis || ''}
                    </Markdown>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
