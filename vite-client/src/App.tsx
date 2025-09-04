import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap-icons/font/bootstrap-icons.css'
import './App.scss'
import { DocumentsTable } from './DocumentsTable'
import { AuthProvider, useAuth } from './AuthContext'
import { AuthGuard } from './AuthGuard'
import type { SortingState } from '@tanstack/react-table'

interface Stats {
  total_documents: number;
  total_files: number;
  pending_files: number;
  completed_files: number;
  completion_percentage: number;
  documents_with_all_completed: number;
  documents_with_partial_completed: number;
  documents_with_no_completed: number;
}

interface Document {
  id: number;
  document_key: string;
  date: string;
  type: string;
  year: number;
  transcription_status: string;
  file_count: number;
  completed_count: number;
  pending_count: number;
  summary?: string;
}

interface SearchResult {
  file_id: number;
  document_id: number;
  document_key: string;
  part_number: number;
  date: string;
  type: string;
  transcription_status: string;
  preview: string;
}

const API_BASE = '/api';

// Navigation Component
const Navigation = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogout = async () => {
    await logout();
  };
  
  return (
    <nav className="navbar navbar-expand-lg navbar-dark bg-primary">
      <div className="container-fluid">
        <button 
          className="navbar-brand fw-bold btn btn-link text-white text-decoration-none border-0"
          onClick={() => navigate('/')}
        >
          <i className="bi bi-file-text me-2"></i>
          MAB Transcription Project
        </button>
        
        <div className="navbar-nav ms-auto d-flex flex-row gap-2">
          <button 
            className="btn btn-link navbar-text text-light"
            onClick={() => navigate('/')}
          >
            <i className="bi bi-house me-1"></i>Dashboard
          </button>
          <button 
            className="btn btn-link navbar-text text-light"
            onClick={() => navigate('/documents')}
          >
            <i className="bi bi-folder2 me-1"></i>Documents
          </button>
          <button 
            className="btn btn-link navbar-text text-light"
            onClick={() => navigate('/search')}
          >
            <i className="bi bi-search me-1"></i>Search
          </button>
          <button 
            className="btn btn-outline-light btn-sm"
            onClick={handleLogout}
            title="Sign Out"
          >
            <i className="bi bi-box-arrow-right"></i>
          </button>
        </div>
      </div>
    </nav>
  );
};

// Dashboard Component
const Dashboard = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`${API_BASE}/stats`, {
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => setStats(data))
      .catch(err => console.error('Failed to fetch stats:', err));
  }, []);

  return (
    <div className="container-fluid">
      <div className="row">
        <div className="col-12">
          <h2 className="mb-4">Transcription Project Dashboard</h2>
          
          {stats ? (
            <div className="row g-4 mb-4">
              <div className="col-md-6 col-lg-2">
                <div className="card h-100 text-center">
                  <div className="card-body">
                    <h6 className="card-subtitle mb-2 text-muted">TOTAL DOCUMENTS</h6>
                    <h2 className="card-title text-primary">{stats.total_documents}</h2>
                  </div>
                </div>
              </div>
              <div className="col-md-6 col-lg-2">
                <div className="card h-100 text-center">
                  <div className="card-body">
                    <h6 className="card-subtitle mb-2 text-muted">TOTAL FILES</h6>
                    <h2 className="card-title text-info">{stats.total_files}</h2>
                  </div>
                </div>
              </div>
              <div className="col-md-6 col-lg-2">
                <div className="card h-100 text-center">
                  <div className="card-body">
                    <h6 className="card-subtitle mb-2 text-muted">COMPLETED FILES</h6>
                    <h2 className="card-title text-success">{stats.completed_files}</h2>
                  </div>
                </div>
              </div>
              <div className="col-md-6 col-lg-2">
                <div className="card h-100 text-center">
                  <div className="card-body">
                    <h6 className="card-subtitle mb-2 text-muted">PENDING FILES</h6>
                    <h2 className="card-title text-warning">{stats.pending_files}</h2>
                  </div>
                </div>
              </div>
              <div className="col-md-12 col-lg-4">
                <div className="card h-100 text-center">
                  <div className="card-body">
                    <h6 className="card-subtitle mb-2 text-muted">COMPLETION</h6>
                    <h2 className="card-title text-success">{stats.completion_percentage?.toFixed(1) || '0.0'}%</h2>
                    <div className="progress mt-3">
                      <div 
                        className="progress-bar bg-success"
                        role="progressbar"
                        style={{ width: `${stats.completion_percentage || 0}%` }}
                        aria-valuenow={stats.completion_percentage || 0}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-5">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              <p className="mt-3 text-muted">Loading statistics...</p>
            </div>
          )}

          <div className="row justify-content-center">
            <div className="col-auto">
              <button onClick={() => navigate('/documents')} className="btn btn-primary btn-lg me-3">
                <i className="bi bi-folder2-open me-2"></i>
                Browse All Documents
              </button>
              <button 
                onClick={() => navigate('/documents?status=completed')} 
                className="btn btn-success btn-lg me-3"
              >
                <i className="bi bi-check-circle me-2"></i>
                View Completed
              </button>
              <button onClick={() => navigate('/search')} className="btn btn-outline-primary btn-lg">
                <i className="bi bi-search me-2"></i>
                Search Transcriptions
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Documents Component
const Documents = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [documentFilters, setDocumentFilters] = useState({
    status: searchParams.get('status') || '',
    type: searchParams.get('type') || '',
    year: searchParams.get('year') || '',
    page: parseInt(searchParams.get('page') || '1'),
    limit: 50
  });

  const [totalDocuments, setTotalDocuments] = useState(0);
  
  // Default sorting: by date, oldest to newest (ascending)
  const [sorting, setSorting] = useState<SortingState>([{
    id: 'date',
    desc: false
  }]);

  const fetchDocuments = async (filters: any = {}) => {
    setDocumentsLoading(true);
    try {
      const limit = filters.limit || 50;
      const page = filters.page || 1;
      
      // Add sorting parameters
      const sortBy = sorting.length > 0 ? sorting[0].id : 'date';
      const sortOrder = sorting.length > 0 ? (sorting[0].desc ? 'desc' : 'asc') : 'asc';
      
      const params = new URLSearchParams({
        limit: limit.toString(),
        page: page.toString(),
        sortBy,
        sortOrder,
        ...Object.fromEntries(
          Object.entries(filters).filter(([key, value]) => 
            value && key !== 'limit' && key !== 'page'
          )
        )
      });
      
      const response = await fetch(`${API_BASE}/documents?${params}`, {
        credentials: 'include'
      });
      const data = await response.json();
      setDocuments(data.documents);
      setTotalDocuments(data.pagination?.total || data.documents.length);
    } catch (err) {
      console.error('Failed to fetch documents:', err);
    } finally {
      setDocumentsLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments(documentFilters);
  }, [sorting]);

  const handleSortingChange = (newSorting: SortingState) => {
    setSorting(newSorting);
    // Reset to first page when sorting changes
    if (documentFilters.page !== 1) {
      updateFilters({ page: 1 });
    }
  };

  const updateFilters = (newFilters: any) => {
    const updatedFilters = { ...documentFilters, ...newFilters };
    setDocumentFilters(updatedFilters);
    fetchDocuments(updatedFilters);
    
    // Update URL params
    const params = new URLSearchParams();
    Object.entries(updatedFilters).forEach(([key, value]) => {
      if (value && key !== 'limit' && (key !== 'page' || value !== 1)) {
        params.set(key, value as string);
      }
    });
    setSearchParams(params);
  };

  const goToPage = (page: number) => {
    updateFilters({ page });
  };

  return (
    <div className="container-fluid">
      <div className="row">
        <div className="col-12">
          <div className="d-flex justify-content-between align-items-center mb-4">
            <h2>
              Documents 
              {totalDocuments > 0 && (
                <span className="text-muted fs-6 ms-2">
                  ({((documentFilters.page - 1) * documentFilters.limit) + 1}-{Math.min(documentFilters.page * documentFilters.limit, totalDocuments)} of {totalDocuments})
                </span>
              )}
            </h2>
            <button onClick={() => navigate('/')} className="btn btn-outline-secondary">
              <i className="bi bi-arrow-left me-2"></i>Back to Dashboard
            </button>
          </div>
          
          {/* Filter Controls */}
          <div className="row mb-4">
            <div className="col-12">
              <div className="card">
                <div className="card-body">
                  <h6 className="card-title">Filter Documents</h6>
                  <div className="row g-3">
                    <div className="col-md-3">
                      <select 
                        className="form-select"
                        value={documentFilters.status}
                        onChange={(e) => updateFilters({ ...documentFilters, status: e.target.value, page: 1 })}
                      >
                        <option value="">All Statuses</option>
                        <option value="completed">Completed</option>
                        <option value="partial">Partial</option>
                        <option value="pending">Pending</option>
                      </select>
                    </div>
                    <div className="col-md-3">
                      <select 
                        className="form-select"
                        value={documentFilters.type}
                        onChange={(e) => updateFilters({ ...documentFilters, type: e.target.value, page: 1 })}
                      >
                        <option value="">All Types</option>
                        <option value="wartime_letters">Wartime Letters</option>
                        <option value="postcards">Postcards</option>
                        <option value="letter">Letters</option>
                      </select>
                    </div>
                    <div className="col-md-3">
                      <select 
                        className="form-select"
                        value={documentFilters.year}
                        onChange={(e) => updateFilters({ ...documentFilters, year: e.target.value, page: 1 })}
                      >
                        <option value="">All Years</option>
                        <option value="1943">1943</option>
                        <option value="1944">1944</option>
                        <option value="1945">1945</option>
                        <option value="1946">1946</option>
                      </select>
                    </div>
                    <div className="col-md-3">
                      <button 
                        className="btn btn-outline-secondary w-100"
                        onClick={() => updateFilters({ status: '', type: '', year: '', page: 1, limit: 50 })}
                      >
                        <i className="bi bi-arrow-clockwise me-2"></i>Reset Filters
                      </button>
                    </div>
                  </div>
                  
                  {/* Quick filter buttons */}
                  <div className="mt-3">
                    <button 
                      className="btn btn-success btn-sm me-2"
                      onClick={() => updateFilters({ ...documentFilters, status: 'completed', page: 1 })}
                    >
                      <i className="bi bi-check-circle me-1"></i>Show Completed
                    </button>
                    <button 
                      className="btn btn-warning btn-sm me-2"
                      onClick={() => updateFilters({ ...documentFilters, status: 'partial', page: 1 })}
                    >
                      <i className="bi bi-clock me-1"></i>Show Partial
                    </button>
                    {/* <button 
                      className="btn btn-info btn-sm"
                      onClick={() => updateFilters({ ...documentFilters, year: '1943', page: 1 })}
                    >
                      <i className="bi bi-calendar me-1"></i>1943 (Most Completed)
                    </button> */}
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Documents Table */}
          <DocumentsTable
            documents={documents}
            totalDocuments={totalDocuments}
            currentPage={documentFilters.page}
            pageSize={documentFilters.limit}
            onPageChange={goToPage}
            onRowClick={(doc) => navigate(`/document/${doc.id}`)}
            loading={documentsLoading}
            sorting={sorting}
            onSortingChange={handleSortingChange}
          />
        </div>
      </div>
    </div>
  );
};

// Search Component
const Search = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const query = searchParams.get('q');
    if (query) {
      setSearchQuery(query);
      performSearch(query);
    }
  }, [searchParams]);

  const performSearch = async (query: string) => {
    try {
      const response = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`, {
        credentials: 'include'
      });
      const data = await response.json();
      setSearchResults(data.results);
    } catch (err) {
      console.error('Search failed:', err);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    await performSearch(searchQuery);
    navigate(`/search?q=${encodeURIComponent(searchQuery)}`);
  };

  return (
    <div className="container-fluid">
      <div className="row">
        <div className="col-12">
          <div className="d-flex justify-content-between align-items-center mb-4">
            <h2>Search Transcriptions</h2>
            <button onClick={() => navigate('/')} className="btn btn-outline-secondary">
              <i className="bi bi-arrow-left me-2"></i>Back to Dashboard
            </button>
          </div>
          
          <div className="row justify-content-center mb-4">
            <div className="col-md-8">
              <div className="input-group input-group-lg">
                <input
                  type="text"
                  className="form-control"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search transcription text..."
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                />
                <button onClick={handleSearch} className="btn btn-primary">
                  <i className="bi bi-search me-2"></i>Search
                </button>
              </div>
            </div>
          </div>
          
          {searchResults.length > 0 && (
            <div className="row">
              <div className="col-12">
                <h4 className="mb-3">Found {searchResults.length} results</h4>
                {searchResults.map(result => (
                  <div key={result.file_id} className="card mb-3">
                    <div className="card-header">
                      <div className="d-flex justify-content-between align-items-center">
                        <div>
                          <h6 className="mb-0">{result.document_key}</h6>
                          <small className="text-muted">Part {result.part_number} • {result.date}</small>
                        </div>
                        <span className={`badge ${
                          result.transcription_status === 'completed' ? 'bg-success' : 'bg-warning'
                        }`}>
                          {result.transcription_status}
                        </span>
                      </div>
                    </div>
                    <div className="card-body">
                      <p className="card-text">{result.preview}...</p>
                      <button 
                        onClick={() => navigate(`/document/${result.document_id}`)}
                        className="btn btn-sm btn-outline-primary"
                      >
                        View Full Document
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Document Detail Component
const DocumentDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [selectedDocument, setSelectedDocument] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (id) {
      fetch(`${API_BASE}/documents/${id}`, {
        credentials: 'include'
      })
        .then(res => res.json())
        .then(data => {
          setSelectedDocument(data);
          setLoading(false);
        })
        .catch(err => {
          console.error('Failed to fetch document details:', err);
          setLoading(false);
        });
    }
  }, [id]);

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading document...</span>
        </div>
      </div>
    );
  }

  if (!selectedDocument) {
    return (
      <div className="container-fluid">
        <div className="text-center py-5">
          <h3>Document not found</h3>
          <button onClick={() => navigate('/documents')} className="btn btn-primary">
            Back to Documents
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid">
      <div className="row">
        <div className="col-12">
          <div className="d-flex justify-content-between align-items-center mb-4">
            <div>
              <h2>{selectedDocument.document.document_key}</h2>
              <p className="text-muted mb-0">{selectedDocument.document.date}</p>
            </div>
            <button onClick={() => navigate('/documents')} className="btn btn-outline-secondary">
              <i className="bi bi-arrow-left me-2"></i>Back to Documents
            </button>
          </div>

          {/* Document Summary */}
          {selectedDocument.document.summary && (
            <div className="alert alert-info mb-4">
              <h5 className="mb-2"><i className="bi bi-lightbulb me-2"></i>Summary</h5>
              <div>{selectedDocument.document.summary}</div>
            </div>
          )}

          <div className="row">
            {selectedDocument.files.map((file: any) => (
              <div key={file.id} className="col-12 mb-4">
                <div className="card">
                  <div className="card-header d-flex justify-content-between align-items-center">
                    <h5 className="mb-0">Page {file.part_number}</h5>
                    <div className="d-flex gap-2 align-items-center">
                      <a 
                        href={`/api/pdf/${file.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-sm btn-outline-primary"
                        title="View original PDF"
                      >
                        <i className="bi bi-file-earmark-pdf me-1"></i>View PDF
                      </a>
                    </div>
                  </div>
                  {file.transcription && (
                    <div className="card-body">
                      <div className="row">
                        <div className="col-12">
                          {/* <h6 className="text-muted mb-2">Transcription:</h6> */}
                          <div className="transcription-text">
                            {file.transcription}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {!file.transcription && (
                    <div className="card-body">
                      <p className="text-muted mb-0">
                        <i className="bi bi-clock me-2"></i>
                        Transcription pending
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// Main App Component
function App() {
  return (
    <AuthProvider>
      <Router>
        <AuthGuard>
          <div className="app">
            <Navigation />
            <main className="py-4">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/documents" element={<Documents />} />
                <Route path="/search" element={<Search />} />
                <Route path="/document/:id" element={<DocumentDetail />} />
              </Routes>
            </main>
          </div>
        </AuthGuard>
      </Router>
    </AuthProvider>
  );
}

export default App;
