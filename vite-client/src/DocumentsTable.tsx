import { useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table'
import type { PaginationState } from '@tanstack/react-table'

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

interface DocumentsTableProps {
  documents: Document[];
  totalDocuments: number;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onRowClick: (document: Document) => void;
  loading?: boolean;
  sorting: SortingState;
  onSortingChange: (sorting: SortingState) => void;
}

const columnHelper = createColumnHelper<Document>()

export const DocumentsTable = ({
  documents,
  totalDocuments,
  currentPage,
  pageSize,
  onPageChange,
  onRowClick,
  loading = false,
  sorting,
  onSortingChange
}: DocumentsTableProps) => {
  
  const columns = useMemo(() => [
    columnHelper.accessor('document_key', {
      header: 'Document',
      cell: (info) => (
        <strong className="text-primary">{info.getValue()}</strong>
      ),
      size: 200,
      minSize: 150,
    }),
    columnHelper.accessor('date', {
      header: 'Date',
      cell: (info) => (
        <small className="text-muted">{info.getValue()}</small>
      ),
      size: 100,
      minSize: 90,
    }),
    columnHelper.accessor('type', {
      header: 'Type',
      cell: (info) => (
        <span className="badge bg-secondary">
          {info.getValue().replace('_', ' ')}
        </span>
      ),
      size: 120,
      minSize: 100,
    }),
    columnHelper.accessor('summary', {
      header: 'Summary',
      cell: (info) => {
        const summary = info.getValue();
        return summary ? (
          <span 
            className="text-muted summary-text"
            title={summary}
            style={{ 
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: '0.9rem',
              cursor: 'help'
            }}
          >
            {summary.length > 120 ? 
              `${summary.substring(0, 120)}...` : 
              summary
            }
          </span>
        ) : (
          <span className="text-muted fst-italic" style={{ fontSize: '0.85rem' }}>
            No summary available
          </span>
        );
      },
      size: 300,
      minSize: 200,
      enableSorting: false,
    }),
    // columnHelper.accessor('transcription_status', {
    //   header: 'Status',
    //   cell: (info) => (
    //     <span className={`badge ${
    //       info.getValue() === 'completed' ? 'bg-success' :
    //       info.getValue() === 'partial' ? 'bg-warning' : 'bg-danger'
    //     }`}>
    //       {info.getValue()}
    //     </span>
    //   ),
    //   size: 110,
    //   minSize: 100,
    // }),
    columnHelper.display({
      id: 'files',
      header: 'Files',
      cell: (info) => {
        const row = info.row.original;
        return (
          <span className="text-muted">
            <strong>{row.completed_count}</strong>/{row.file_count}
          </span>
        );
      },
      size: 80,
      minSize: 70,
    }),
  ], [])

  const pagination = useMemo<PaginationState>(() => ({
    pageIndex: currentPage - 1,
    pageSize: pageSize,
  }), [currentPage, pageSize])

  const table = useReactTable({
    data: documents,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    manualPagination: true,
    manualSorting: true,
    pageCount: Math.ceil(totalDocuments / pageSize),
    state: {
      pagination,
      sorting,
    },
    onPaginationChange: (updater) => {
      const newPagination = typeof updater === 'function' ? updater(pagination) : updater
      onPageChange(newPagination.pageIndex + 1)
    },
    onSortingChange: (updater) => {
      const newSorting = typeof updater === 'function' ? updater(sorting) : updater
      onSortingChange(newSorting)
    },
  })

  const totalPages = Math.ceil(totalDocuments / pageSize)

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading documents...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-body p-0">
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead className="table-light">
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                    <th 
                      key={header.id}
                      style={{ 
                        width: header.getSize(),
                        minWidth: header.column.columnDef.minSize,
                        cursor: header.column.getCanSort() ? 'pointer' : 'default'
                      }}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div className="d-flex align-items-center">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() && (
                          <span className="ms-1">
                            {header.column.getIsSorted() === 'asc' ? (
                              <i className="bi bi-chevron-up"></i>
                            ) : header.column.getIsSorted() === 'desc' ? (
                              <i className="bi bi-chevron-down"></i>
                            ) : (
                              <i className="bi bi-chevron-expand text-muted"></i>
                            )}
                          </span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map(row => (
                <tr 
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => onRowClick(row.original)}
                  style={{ cursor: 'pointer' }}
                >
                  {row.getVisibleCells().map(cell => (
                    <td 
                      key={cell.id}
                      style={{
                        width: cell.column.getSize(),
                        minWidth: cell.column.columnDef.minSize,
                        maxWidth: cell.column.getSize(),
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Enhanced Pagination Footer */}
      {totalPages > 1 && (
        <div className="card-footer">
          <div className="d-flex justify-content-between align-items-center">
            <div className="text-muted">
              Showing {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, totalDocuments)} of {totalDocuments} documents
            </div>
            
            <div className="d-flex align-items-center gap-3">
              {/* Page size selector */}
              <div className="d-flex align-items-center gap-2">
                <span className="text-muted small">Show:</span>
                <select 
                  className="form-select form-select-sm"
                  style={{ width: 'auto' }}
                  value={pageSize}
                  onChange={(e) => {
                    // This would need to be handled by parent component
                    console.log('Page size change:', e.target.value)
                  }}
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              {/* Pagination controls */}
              <nav aria-label="Documents pagination">
                <ul className="pagination pagination-sm mb-0">
                  <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
                    <button 
                      className="page-link" 
                      onClick={() => onPageChange(1)}
                      disabled={currentPage === 1}
                      title="First page"
                    >
                      <i className="bi bi-chevron-double-left"></i>
                    </button>
                  </li>
                  <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
                    <button 
                      className="page-link" 
                      onClick={() => onPageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      title="Previous page"
                    >
                      <i className="bi bi-chevron-left"></i>
                    </button>
                  </li>
                  
                  {/* Page numbers */}
                  {Array.from({ length: Math.min(5, totalPages) }, (_, index) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = index + 1;
                    } else if (currentPage <= 3) {
                      pageNum = index + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + index;
                    } else {
                      pageNum = currentPage - 2 + index;
                    }
                    
                    return (
                      <li key={pageNum} className={`page-item ${currentPage === pageNum ? 'active' : ''}`}>
                        <button 
                          className="page-link" 
                          onClick={() => onPageChange(pageNum)}
                        >
                          {pageNum}
                        </button>
                      </li>
                    );
                  })}
                  
                  <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}>
                    <button 
                      className="page-link" 
                      onClick={() => onPageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      title="Next page"
                    >
                      <i className="bi bi-chevron-right"></i>
                    </button>
                  </li>
                  <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}>
                    <button 
                      className="page-link" 
                      onClick={() => onPageChange(totalPages)}
                      disabled={currentPage === totalPages}
                      title="Last page"
                    >
                      <i className="bi bi-chevron-double-right"></i>
                    </button>
                  </li>
                </ul>
              </nav>
            </div>
          </div>
        </div>
      )}
      
      {documents.length === 0 && !loading && (
        <div className="card-body">
          <div className="text-center py-5">
            <i className="bi bi-folder2-open display-1 text-muted"></i>
            <p className="text-muted mt-3">No documents found with the current filters</p>
          </div>
        </div>
      )}
    </div>
  )
}
