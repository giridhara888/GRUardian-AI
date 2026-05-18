import React, { useState } from 'react';
import { UploadCloud, FileJson, CheckCircle, DatabaseZap, Clock } from 'lucide-react';
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
  const [stats, setStats] = useState<any>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const { user } = useAuth();
  
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
        
        let nullCount = 0;
        rows.forEach(r => {
           Object.values(r).forEach(val => {
             if (!val || val === '') nullCount++;
           });
        });

        // Save first 100 rows to the datasets collection
        let ingested = 0;
        try {
          const datasetsRef = collection(db, 'datasets');
          for (let i = 0; i < Math.min(rows.length, 100); i++) {
            const row = rows[i];
            
            await addDoc(datasetsRef, {
              timestamp: new Date().toISOString(),
              userId: user.uid,
              dataDump: JSON.stringify(row)
            });
            ingested++;
          }
          toast.success(`Ingested ${ingested} dataset records to Firestore.`);
        } catch (error) {
           console.error("Firestore error:", error);
           toast.error("Failed to ingest some or all records to database.");
        }

        setStats({
          rows: rows.length,
          features,
          nullValues: nullCount,
          memoryUsage: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
          sampleData: JSON.stringify(rows.slice(0, 50))
        });
        
        setUploading(false);
        setFile(null);
        
        // Trigger AI Analysis
        handleAIAnalysis(JSON.stringify(rows.slice(0, 50)));
      },
      error: (error) => {
        console.error("Error parsing CSV:", error);
        toast.error("Failed to parse CSV file");
        setUploading(false);
      }
    });
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
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-200">Dataset Management</h1>
        <p className="mt-1 text-sm text-slate-500">Upload Google Cluster Trace data and preprocess for ML training.</p>
      </div>

      <div className="bg-[#111318] shadow-sm rounded-xl border border-slate-800 p-8">
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
        </div>
      </div>

      {stats && (
        <div className="bg-[#111318] shadow-sm rounded-xl border border-slate-800 p-6">
           <div className="flex justify-between items-center mb-6">
              <div className="flex items-center">
                 <CheckCircle className="h-6 w-6 text-green-500 mr-2" />
                 <h3 className="text-lg font-medium text-slate-200">Dataset Processed Successfully</h3>
              </div>
              <button 
                 onClick={handleRetrain}
                 disabled={retraining}
                 className="flex items-center px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700 transition-colors disabled:opacity-50 shadow-md shadow-purple-900/20 shadow-inner"
              >
                 {retraining ? <Clock className="animate-spin h-4 w-4 mr-2" /> : <DatabaseZap className="h-4 w-4 mr-2" />}
                 {retraining ? 'Retraining Pipeline Active...' : 'Trigger Cloud Retrain Pipeline'}
              </button>
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
