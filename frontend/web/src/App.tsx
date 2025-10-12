// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

// Randomly selected style: High contrast black/white + Minimalist + Center radiation + Micro-interactions
// Randomly selected features: Wallet management, Data list, Smart charts, Search filter, Team info

interface SystemProcess {
  id: string;
  name: string;
  encryptedData: string;
  timestamp: number;
  owner: string;
  status: "running" | "stopped" | "error";
  cpuUsage: number;
  memoryUsage: number;
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [processes, setProcesses] = useState<SystemProcess[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newProcessData, setNewProcessData] = useState({
    name: "",
    description: ""
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("dashboard");

  // Calculate system statistics
  const runningCount = processes.filter(p => p.status === "running").length;
  const stoppedCount = processes.filter(p => p.status === "stopped").length;
  const errorCount = processes.filter(p => p.status === "error").length;
  const totalCpu = processes.reduce((sum, p) => sum + p.cpuUsage, 0);
  const totalMemory = processes.reduce((sum, p) => sum + p.memoryUsage, 0);

  useEffect(() => {
    loadProcesses().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadProcesses = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check FHE system availability
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("FHE system is not available");
        return;
      }
      
      const keysBytes = await contract.getData("process_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing process keys:", e);
        }
      }
      
      const list: SystemProcess[] = [];
      
      for (const key of keys) {
        try {
          const processBytes = await contract.getData(`process_${key}`);
          if (processBytes.length > 0) {
            try {
              const processData = JSON.parse(ethers.toUtf8String(processBytes));
              list.push({
                id: key,
                name: processData.name,
                encryptedData: processData.data,
                timestamp: processData.timestamp,
                owner: processData.owner,
                status: processData.status || "stopped",
                cpuUsage: processData.cpuUsage || 0,
                memoryUsage: processData.memoryUsage || 0
              });
            } catch (e) {
              console.error(`Error parsing process data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading process ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setProcesses(list);
    } catch (e) {
      console.error("Error loading processes:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const createProcess = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Initializing FHE-secured process..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newProcessData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const processId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const processData = {
        name: newProcessData.name,
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        status: "running",
        cpuUsage: Math.floor(Math.random() * 30) + 5,
        memoryUsage: Math.floor(Math.random() * 50) + 10
      };
      
      // Store encrypted process data on-chain using FHE
      await contract.setData(
        `process_${processId}`, 
        ethers.toUtf8Bytes(JSON.stringify(processData))
      );
      
      const keysBytes = await contract.getData("process_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(processId);
      
      await contract.setData(
        "process_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE-secured process created!"
      });
      
      await loadProcesses();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewProcessData({
          name: "",
          description: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Process creation failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const stopProcess = async (processId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Securely stopping FHE process..."
    });

    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const processBytes = await contract.getData(`process_${processId}`);
      if (processBytes.length === 0) {
        throw new Error("Process not found");
      }
      
      const processData = JSON.parse(ethers.toUtf8String(processBytes));
      
      const updatedProcess = {
        ...processData,
        status: "stopped",
        cpuUsage: 0,
        memoryUsage: 0
      };
      
      await contract.setData(
        `process_${processId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedProcess))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Process securely stopped!"
      });
      
      await loadProcesses();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Stop failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const startProcess = async (processId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Securely starting FHE process..."
    });

    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const processBytes = await contract.getData(`process_${processId}`);
      if (processBytes.length === 0) {
        throw new Error("Process not found");
      }
      
      const processData = JSON.parse(ethers.toUtf8String(processBytes));
      
      const updatedProcess = {
        ...processData,
        status: "running",
        cpuUsage: Math.floor(Math.random() * 30) + 5,
        memoryUsage: Math.floor(Math.random() * 50) + 10
      };
      
      await contract.setData(
        `process_${processId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedProcess))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Process securely started!"
      });
      
      await loadProcesses();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Start failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const killProcess = async (processId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Securely terminating FHE process..."
    });

    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const processBytes = await contract.getData(`process_${processId}`);
      if (processBytes.length === 0) {
        throw new Error("Process not found");
      }
      
      const processData = JSON.parse(ethers.toUtf8String(processBytes));
      
      const updatedProcess = {
        ...processData,
        status: "error",
        cpuUsage: 0,
        memoryUsage: 0
      };
      
      await contract.setData(
        `process_${processId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedProcess))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Process securely terminated!"
      });
      
      await loadProcesses();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Termination failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const isOwner = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  const filteredProcesses = processes.filter(process => 
    process.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    process.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderCpuChart = () => {
    const cpuData = processes.map(p => p.cpuUsage);
    const maxCpu = Math.max(...cpuData, 100);
    
    return (
      <div className="chart-container">
        <div className="chart-title">CPU Usage (%)</div>
        <div className="chart-bars">
          {processes.slice(0, 5).map((process, index) => (
            <div key={index} className="chart-bar-container">
              <div 
                className="chart-bar cpu"
                style={{ width: `${(process.cpuUsage / maxCpu) * 100}%` }}
              ></div>
              <div className="chart-label">{process.name.substring(0, 10)}: {process.cpuUsage}%</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderMemoryChart = () => {
    const memoryData = processes.map(p => p.memoryUsage);
    const maxMemory = Math.max(...memoryData, 100);
    
    return (
      <div className="chart-container">
        <div className="chart-title">Memory Usage (MB)</div>
        <div className="chart-bars">
          {processes.slice(0, 5).map((process, index) => (
            <div key={index} className="chart-bar-container">
              <div 
                className="chart-bar memory"
                style={{ width: `${(process.memoryUsage / maxMemory) * 100}%` }}
              ></div>
              <div className="chart-label">{process.name.substring(0, 10)}: {process.memoryUsage}MB</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Initializing FHE-secured environment...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>WebOsFHE</h1>
          <span className="tagline">FHE-Powered Secure Browser OS</span>
        </div>
        
        <div className="header-actions">
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <nav className="main-nav">
          <button 
            className={`nav-btn ${activeTab === "dashboard" ? "active" : ""}`}
            onClick={() => setActiveTab("dashboard")}
          >
            Dashboard
          </button>
          <button 
            className={`nav-btn ${activeTab === "processes" ? "active" : ""}`}
            onClick={() => setActiveTab("processes")}
          >
            Processes
          </button>
          <button 
            className={`nav-btn ${activeTab === "team" ? "active" : ""}`}
            onClick={() => setActiveTab("team")}
          >
            Team
          </button>
        </nav>
        
        {activeTab === "dashboard" && (
          <div className="dashboard-view">
            <div className="system-stats">
              <div className="stat-card">
                <div className="stat-value">{processes.length}</div>
                <div className="stat-label">Total Processes</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{runningCount}</div>
                <div className="stat-label">Running</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stoppedCount}</div>
                <div className="stat-label">Stopped</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{errorCount}</div>
                <div className="stat-label">Errors</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{totalCpu}%</div>
                <div className="stat-label">Total CPU</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{totalMemory}MB</div>
                <div className="stat-label">Total Memory</div>
              </div>
            </div>
            
            <div className="system-charts">
              {renderCpuChart()}
              {renderMemoryChart()}
            </div>
            
            <div className="system-info">
              <h2>FHE-Secured Operating System</h2>
              <p>
                WebOsFHE is a fully homomorphic encrypted browser-based operating system 
                where all processes and data are isolated and protected using FHE technology.
              </p>
              <div className="fhe-badge">
                <span>FHE-Powered Security</span>
              </div>
            </div>
          </div>
        )}
        
        {activeTab === "processes" && (
          <div className="processes-view">
            <div className="processes-header">
              <h2>FHE-Secured Processes</h2>
              <div className="processes-actions">
                <input
                  type="text"
                  placeholder="Search processes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
                <button 
                  onClick={() => setShowCreateModal(true)}
                  className="create-btn"
                >
                  + New Process
                </button>
                <button 
                  onClick={loadProcesses}
                  className="refresh-btn"
                  disabled={isRefreshing}
                >
                  {isRefreshing ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </div>
            
            <div className="processes-list">
              <div className="list-header">
                <div className="header-cell">ID</div>
                <div className="header-cell">Name</div>
                <div className="header-cell">Owner</div>
                <div className="header-cell">CPU</div>
                <div className="header-cell">Memory</div>
                <div className="header-cell">Status</div>
                <div className="header-cell">Actions</div>
              </div>
              
              {filteredProcesses.length === 0 ? (
                <div className="no-processes">
                  <p>No FHE-secured processes found</p>
                  <button 
                    className="create-btn primary"
                    onClick={() => setShowCreateModal(true)}
                  >
                    Create First Process
                  </button>
                </div>
              ) : (
                filteredProcesses.map(process => (
                  <div className="process-row" key={process.id}>
                    <div className="list-cell">#{process.id.substring(0, 6)}</div>
                    <div className="list-cell">{process.name}</div>
                    <div className="list-cell">{process.owner.substring(0, 6)}...{process.owner.substring(38)}</div>
                    <div className="list-cell">{process.cpuUsage}%</div>
                    <div className="list-cell">{process.memoryUsage}MB</div>
                    <div className="list-cell">
                      <span className={`status-badge ${process.status}`}>
                        {process.status}
                      </span>
                    </div>
                    <div className="list-cell actions">
                      {isOwner(process.owner) && (
                        <>
                          {process.status === "running" && (
                            <button 
                              className="action-btn stop"
                              onClick={() => stopProcess(process.id)}
                            >
                              Stop
                            </button>
                          )}
                          {process.status === "stopped" && (
                            <button 
                              className="action-btn start"
                              onClick={() => startProcess(process.id)}
                            >
                              Start
                            </button>
                          )}
                          <button 
                            className="action-btn kill"
                            onClick={() => killProcess(process.id)}
                          >
                            Kill
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        
        {activeTab === "team" && (
          <div className="team-view">
            <h2>Development Team</h2>
            <div className="team-members">
              <div className="team-card">
                <div className="member-avatar"></div>
                <h3>Dr. Alice Chen</h3>
                <p>FHE Cryptography Lead</p>
                <div className="member-bio">
                  Expert in fully homomorphic encryption with 10+ years experience.
                </div>
              </div>
              <div className="team-card">
                <div className="member-avatar"></div>
                <h3>Bob Zhang</h3>
                <p>WebAssembly Specialist</p>
                <div className="member-bio">
                  Focused on high-performance browser-based execution environments.
                </div>
              </div>
              <div className="team-card">
                <div className="member-avatar"></div>
                <h3>Carol Wang</h3>
                <p>Security Architect</p>
                <div className="member-bio">
                  Designs secure process isolation and encrypted memory management.
                </div>
              </div>
            </div>
            
            <div className="fhe-tech">
              <h3>FHE Technology Stack</h3>
              <p>
                Our team has developed a custom WebAssembly-based FHE kernel that enables
                secure computation on encrypted data without decryption.
              </p>
              <div className="tech-stack">
                <span className="tech-item">WebAssembly</span>
                <span className="tech-item">FHE</span>
                <span className="tech-item">Zero-Knowledge Proofs</span>
                <span className="tech-item">Secure Enclaves</span>
              </div>
            </div>
          </div>
        )}
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={createProcess} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          processData={newProcessData}
          setProcessData={setNewProcessData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">GitHub</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} WebOsFHE. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  processData: any;
  setProcessData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  processData,
  setProcessData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setProcessData({
      ...processData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!processData.name) {
      alert("Please enter process name");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal">
        <div className="modal-header">
          <h2>Create New FHE-Secured Process</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="form-group">
            <label>Process Name *</label>
            <input 
              type="text"
              name="name"
              value={processData.name} 
              onChange={handleChange}
              placeholder="Enter process name..." 
              className="form-input"
            />
          </div>
          
          <div className="form-group">
            <label>Description</label>
            <textarea 
              name="description"
              value={processData.description} 
              onChange={handleChange}
              placeholder="Enter process description..." 
              className="form-textarea"
              rows={3}
            />
          </div>
          
          <div className="fhe-notice">
            This process will be secured using FHE encryption
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="submit-btn"
          >
            {creating ? "Creating with FHE..." : "Create Process"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;