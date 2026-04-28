import { useEffect, useState } from "react";
import {
  useListColumns,
  useListRows,
  useDeleteRow,
  getListRowsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Table as UITable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Edit2,
  Filter,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Key,
  X,
  Upload,
  Loader2,
  Play,
  Terminal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RowEditorDialog } from "./row-editor";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

interface TableViewerProps {
  connectionId: number;
  table: string;
  readOnly?: boolean;
}

function parseTableName(table: string) {
  const parts = decodeURIComponent(table).split(".");
  if (parts.length === 1) {
    return { schema: "public", table: parts[0] };
  }
  if (parts.length === 2) {
    return { schema: parts[0], table: parts[1] };
  }
  throw new Error("Invalid table name");
}

// Function to parse index definition and extract column names
const parseIndexColumns = (indexdef: string): string => {
  const match = indexdef.match(/USING\s+\w+\s*\(([^)]+)\)/i);
  if (match) {
    return match[1].trim();
  }
  return indexdef; // Fallback to full definition if parsing fails
};

export default function TableViewer({ connectionId, table, readOnly = false }: TableViewerProps) {
  const [page, setPage] = useState(0);
  const limit = 50;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [rowToDelete, setRowToDelete] = useState<any | null>(null);
  const [rowSearch, setRowSearch] = useState("");
  const [filterColumn, setFilterColumn] = useState("all");
  const [filterValue, setFilterValue] = useState("");
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const deleteMutation = useDeleteRow();
  
  // CSV Import state
  const [showCsvImportDialog, setShowCsvImportDialog] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<any>(null);
  const [isImporting, setIsImporting] = useState(false);
  
  // Table Structure state
  const [tableStructure, setTableStructure] = useState<any>(null);
  const [isLoadingStructure, setIsLoadingStructure] = useState(false);

  // SQL Editor state
  const [sqlQuery, setSqlQuery] = useState("");
  const [isExecutingSql, setIsExecutingSql] = useState(false);
  const [sqlResults, setSqlResults] = useState<any>(null);

  const {
    data: columnsData,
    isLoading: isLoadingColumns,
    isError: isColumnsError,
  } = useListColumns({ connectionId, table });

  const columns = columnsData?.columns || [];
  const validFilterColumn = columns.some((column) => column.name === filterColumn)
    ? filterColumn
    : "all";
  const trimmedSearch = rowSearch.trim();
  const trimmedFilterValue = filterValue.trim();

  // CSV Import functions
  const parseCSV = (text: string) => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length === 0) return null;
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const rows = lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
      const row: any = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      return row;
    });
    
    return { headers, rows };
  };

  const handleCsvFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setCsvFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const parsed = parseCSV(text);
        setCsvData(parsed);
      };
      reader.readAsText(file);
    }
  };

  const handleCsvImport = async () => {
    if (!csvData || !csvFile) return;
    
    setIsImporting(true);
    try {
      const response = await fetch(`/api/connections/${connectionId}/tables/${encodeURIComponent(table)}/import-csv`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          headers: csvData.headers,
          rows: csvData.rows,
        }),
      });
      
      const result = await response.json();
      
      if (response.ok) {
        toast({
          title: "Import Successful",
          description: `Successfully imported ${result.successCount} rows${result.errorCount > 0 ? ` (${result.errorCount} errors)` : ''}`,
        });
        refetch();
      } else {
        throw new Error(result.error || 'Import failed');
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Import Failed",
        description: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    } finally {
      setIsImporting(false);
      setShowCsvImportDialog(false);
      setCsvFile(null);
      setCsvData(null);
    }
  };

  const fetchTableStructure = async () => {
    if (tableStructure) return; // Already loaded
    
    setIsLoadingStructure(true);
    try {
      const response = await fetch(`/api/connections/${connectionId}/tables/${encodeURIComponent(table)}/structure`);
      const result = await response.json();
      
      if (response.ok) {
        setTableStructure(result);
      } else {
        throw new Error(result.error || 'Failed to load table structure');
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error Loading Structure",
        description: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    } finally {
      setIsLoadingStructure(false);
    }
  };

  const executeSql = async () => {
    if (!sqlQuery.trim()) return;
    
    setIsExecutingSql(true);
    try {
      const response = await fetch(`/api/connections/${connectionId}/execute-sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sql: sqlQuery }),
      });
      
      const result = await response.json();
      
      if (response.ok) {
        setSqlResults(result);
        toast({
          title: "SQL Executed Successfully",
          description: `${result.rowsAffected} row(s) affected`,
        });
      } else {
        throw new Error(result.error || 'SQL execution failed');
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "SQL Execution Failed",
        description: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    } finally {
      setIsExecutingSql(false);
    }
  };

  const activeFilterColumn = validFilterColumn === "all" ? undefined : validFilterColumn;
  const hasActiveFilters = Boolean(trimmedSearch || (activeFilterColumn && trimmedFilterValue));
  const rowQueryParams = {
    connectionId,
    table,
    limit,
    offset: page * limit,
    search: trimmedSearch || undefined,
    filterColumn: activeFilterColumn,
    filterValue: activeFilterColumn && trimmedFilterValue ? trimmedFilterValue : undefined,
  };

  const {
    data: rowsData,
    isLoading: isLoadingRows,
    isError: isRowsError,
    refetch,
    isFetching,
  } = useListRows(rowQueryParams);

  const primaryKeys = columns.filter((c) => c.isPrimaryKey).map((c) => c.name);

  useEffect(() => {
    setPage(0);
    setRowSearch("");
    setFilterColumn("all");
    setFilterValue("");
  }, [table]);

  useEffect(() => {
    setPage(0);
  }, [rowSearch, filterColumn, filterValue]);

  const getPrimaryKeyValue = (row: any) => {
    if (primaryKeys.length === 0) return null;
    const pkObj: Record<string, any> = {};
    primaryKeys.forEach((k) => {
      pkObj[k] = row[k];
    });
    return pkObj;
  };

  const clearFilters = () => {
    setRowSearch("");
    setFilterColumn("all");
    setFilterValue("");
  };

  const handleDelete = () => {
    if (!rowToDelete) return;
    
    deleteMutation.mutate(
      { 
        data: { primaryKey: rowToDelete.primaryKey },
        params: { connectionId, table }
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListRowsQueryKey() });
          refetch();
          toast({
            title: "Row deleted",
            description: "The row has been successfully deleted.",
          });
          setRowToDelete(null);
        },
        onError: (error: any) => {
          toast({
            variant: "destructive",
            title: "Delete failed",
            description: error?.message || "Failed to delete the row",
          });
        },
      }
    );
  };

  const handleBulkDelete = () => {
    if (selectedRows.size === 0) return;
    setShowBulkDeleteDialog(true);
  };

  const confirmBulkDelete = async () => {
    const rows = rowsData?.rows || [];
    const selectedRowKeys = Array.from(selectedRows).map(index => {
      const row = rows[index];
      if (!row) return null;
      const pk = getPrimaryKeyValue(row);
      return pk;
    }).filter((pk): pk is Record<string, any> => pk !== null);

    if (selectedRowKeys.length === 0) {
      toast({
        variant: "destructive",
        title: "Cannot delete",
        description: "No valid rows selected for deletion",
      });
      return;
    }

    try {
      const deletePromises = selectedRowKeys.map(pkValue => 
        new Promise((resolve, reject) => {
          deleteMutation.mutate(
            { 
              data: { primaryKey: pkValue },
              params: { connectionId, table }
            },
            {
              onSuccess: () => resolve(undefined),
              onError: (error: any) => reject(error)
            }
          );
        })
      );

      await Promise.all(deletePromises);
      
      refetch();
      setSelectedRows(new Set());
      toast({
        title: "Rows deleted",
        description: `${selectedRowKeys.length} row(s) have been successfully deleted.`,
      });
      setShowBulkDeleteDialog(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: error?.message || "Failed to delete some rows",
      });
    }
  };

  const toggleRowSelection = (index: number) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedRows(newSelected);
  };

  const toggleAllRows = () => {
    const rows = rowsData?.rows || [];
    if (selectedRows.size === rows.length && rows.length > 0) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(rows.map((_, index) => index)));
    }
  };

  if (isColumnsError || isRowsError) {
    return (
      <div className="p-8 text-center text-destructive">
        <h3 className="text-lg font-semibold mb-2">Error Loading Data</h3>
        <p>There was a problem communicating with database.</p>
        <Button variant="outline" className="mt-4" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="h-14 border-b flex items-center justify-between px-4 shrink-0 bg-card">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            {table}
          </h2>
          {isFetching && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="button-refresh-table"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const params = new URLSearchParams();
              if (trimmedSearch) params.set('search', trimmedSearch);
              if (activeFilterColumn && trimmedFilterValue) {
                params.set('filterColumn', activeFilterColumn);
                params.set('filterValue', trimmedFilterValue);
              }
              const url = `/api/connections/${connectionId}/tables/${encodeURIComponent(table)}/export${params.toString() ? '?' + params.toString() : ''}`;
              const link = document.createElement('a');
              link.href = url;
              link.download = `${parseTableName(table).table}.csv`;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }}
            data-testid="button-export-csv"
          >
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          {!readOnly && (
            <Dialog open={showCsvImportDialog} onOpenChange={setShowCsvImportDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Upload className="mr-2 h-4 w-4" />
                  Import CSV
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Import CSV Data</DialogTitle>
                  <DialogDescription>
                    Upload a CSV file to import data into {parseTableName(table).table} table.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="csv-file" className="block text-sm font-medium mb-2">
                      Select CSV File
                    </label>
                    <input
                      id="csv-file"
                      type="file"
                      accept=".csv"
                      onChange={handleCsvFileChange}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                    />
                  </div>
                  
                  {csvData && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Preview (First 5 rows)</h4>
                      <div className="border rounded-md overflow-auto max-h-64">
                        <table className="w-full text-sm">
                          <thead className="bg-muted">
                            <tr>
                              {csvData.headers.map((header: string, index: number) => (
                                <th key={index} className="px-2 py-1 text-left font-medium border-b">
                                  {header}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {csvData.rows.slice(0, 5).map((row: any, rowIndex: number) => (
                              <tr key={rowIndex} className="border-b">
                                {csvData.headers.map((header: string, colIndex: number) => (
                                  <td key={colIndex} className="px-2 py-1 text-xs">
                                    {row[header]?.toString() || ''}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Total rows: {csvData.rows.length}
                      </p>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowCsvImportDialog(false);
                      setCsvFile(null);
                      setCsvData(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCsvImport}
                    disabled={!csvData || isImporting}
                  >
                    {isImporting && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
                    Import Data
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          {!readOnly && (
            <RowEditorDialog
              connectionId={connectionId}
              table={table}
              columns={columns}
              mode="create"
              onSuccess={() => refetch()}
            >
              <Button size="sm" data-testid="button-create-row">
                <Plus className="mr-2 h-4 w-4" />
                Add Row
              </Button>
            </RowEditorDialog>
          )}
        </div>
      </div>

      <div className="border-b bg-card/60 px-4 py-3 shrink-0">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={rowSearch}
              onChange={(event) => setRowSearch(event.target.value)}
              placeholder="Search rows..."
              className="h-9 pl-8"
              data-testid="input-row-search"
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {selectedRows.size > 0 && !readOnly && columns.some(col => col.isPrimaryKey) && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBulkDelete}
                className="h-9"
                data-testid="button-delete-selected"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Selected ({selectedRows.size})
              </Button>
            )}
            <Select value={validFilterColumn} onValueChange={setFilterColumn}>
              <SelectTrigger className="h-9 sm:w-[190px]" data-testid="select-filter-column">
                <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
                <SelectValue placeholder="Filter column" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any column</SelectItem>
                {columns.map((column) => (
                  <SelectItem key={column.name} value={column.name}>
                    {column.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={filterValue}
              onChange={(event) => setFilterValue(event.target.value)}
              placeholder={validFilterColumn === "all" ? "Choose a column first" : "Column contains..."}
              disabled={validFilterColumn === "all"}
              className="h-9 sm:w-[220px]"
              data-testid="input-column-filter"
            />
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-filters">
                <X className="mr-2 h-4 w-4" />
                Clear
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-auto p-4 relative">
        <Tabs defaultValue="data" className="flex flex-col h-full">
          <TabsList className="grid w-full grid-cols-3 h-10 shrink-0">
            <TabsTrigger value="data" className="flex items-center gap-2">
              Data
            </TabsTrigger>
            <TabsTrigger value="structure" className="flex items-center gap-2" onClick={fetchTableStructure}>
              Structure
            </TabsTrigger>
            <TabsTrigger value="sql" className="flex items-center gap-2">
              <Terminal className="h-4 w-4" />
              SQL Editor
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="data" className="flex-1 overflow-auto mt-4">
            <div className="border rounded-md bg-card shadow-sm overflow-hidden">
              <UITable className="whitespace-nowrap">
                <TableHeader className="bg-muted/50 sticky top-0 z-10 shadow-sm">
                  <TableRow>
                    {isLoadingColumns ? (
                      <TableHead><Skeleton className="h-4 w-24" /></TableHead>
                    ) : (
                      <>
                        {!readOnly && columns.some(col => col.isPrimaryKey) && (
                          <TableHead className="w-[50px] sticky left-0 bg-muted/50 z-20 shadow-[1px_0_0_0_hsl(var(--border))]">
                            <input
                              type="checkbox"
                              checked={selectedRows.size === (rowsData?.rows?.length || 0) && (rowsData?.rows?.length || 0) > 0}
                              onChange={toggleAllRows}
                              className="rounded border-gray-300"
                              ref={(el) => {
                                if (el) el.indeterminate = selectedRows.size > 0 && selectedRows.size < (rowsData?.rows?.length || 0);
                              }}
                            />
                          </TableHead>
                        )}
                        <TableHead className="w-[100px] sticky left-0 bg-muted/50 z-20 shadow-[1px_0_0_0_hsl(var(--border))]">Actions</TableHead>
                        {columns.map((col) => (
                          <TableHead key={col.name} className="min-w-[150px]">
                            <div className="flex flex-col gap-1 py-2">
                              <span className="font-semibold text-foreground flex items-center gap-1.5">
                                {col.isPrimaryKey && <Key className="h-3 w-3 text-amber-500" />}
                                {col.name}
                              </span>
                              <span className="text-xs text-muted-foreground font-mono font-normal flex gap-1">
                                {col.dataType}
                                {col.nullable && <Badge variant="secondary" className="text-xs px-1 py-0">NULL</Badge>}
                              </span>
                            </div>
                          </TableHead>
                        ))}
                      </>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingRows ? (
                    Array.from({ length: 5 }).map((_, rowIndex) => (
                      <TableRow key={rowIndex}>
                        <TableCell className="w-[100px] sticky left-0 bg-background z-20 shadow-[1px_0_0_0_hsl(var(--border))]">
                          <Skeleton className="h-8 w-16" />
                        </TableCell>
                        {columns.map((_, colIndex) => (
                          <TableCell key={colIndex}>
                            <Skeleton className="h-8 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : rowsData?.rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={columns.length + (!readOnly && columns.some(col => col.isPrimaryKey) ? 2 : 1)} className="text-center text-muted-foreground py-8">
                        {hasActiveFilters ? "No rows found matching your filters" : "No data in this table"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    rowsData?.rows.map((row: any, rowIndex: number) => (
                      <TableRow key={rowIndex}>
                        {!readOnly && columns.some(col => col.isPrimaryKey) && (
                          <TableCell className="w-[50px] sticky left-0 bg-background z-20 shadow-[1px_0_0_0_hsl(var(--border))]">
                            <input
                              type="checkbox"
                              checked={selectedRows.has(rowIndex)}
                              onChange={() => toggleRowSelection(rowIndex)}
                              className="rounded border-gray-300"
                            />
                          </TableCell>
                        )}
                        <TableCell className="w-[100px] sticky left-0 bg-background z-20 shadow-[1px_0_0_0_hsl(var(--border))]">
                          <div className="flex items-center gap-1">
                            {!readOnly && (
                              <RowEditorDialog
                                connectionId={connectionId}
                                table={table}
                                columns={columns}
                                mode="edit"
                                initialData={row}
                                onSuccess={() => refetch()}
                              >
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <Edit2 className="h-3 w-3" />
                                </Button>
                              </RowEditorDialog>
                            )}
                            {!readOnly && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => setRowToDelete(row)}
                                data-testid={`button-delete-row-${rowIndex}`}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                        {columns.map((col) => {
                          const val = row[col.name];
                          const isNull = val === null || val === undefined;
                          const isBool = typeof val === "boolean";
                          const displayVal = isNull ? "NULL" : isBool ? (val ? "true" : "false") : String(val);

                          return (
                            <TableCell key={col.name} className="font-mono text-sm max-w-[300px] truncate">
                              {isNull ? (
                                <span className="text-muted-foreground/50 italic">NULL</span>
                              ) : isBool ? (
                                <Badge variant={val ? "default" : "secondary"} className="text-xs">
                                  {displayVal}
                                </Badge>
                              ) : (
                                <span title={displayVal}>{displayVal}</span>
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </UITable>
            </div>
          </TabsContent>
      
          <TabsContent value="structure" className="flex-1 overflow-auto mt-4">
            {isLoadingStructure ? (
              <div className="flex items-center justify-center h-32">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : tableStructure ? (
              <div className="space-y-6">
                {/* Columns Section */}
                <div>
                  <h3 className="text-lg font-semibold mb-3">Columns</h3>
                  <div className="border rounded-md overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium">Column Name</th>
                          <th className="px-4 py-2 text-left font-medium">Data Type</th>
                          <th className="px-4 py-2 text-left font-medium">Nullable</th>
                          <th className="px-4 py-2 text-left font-medium">Default Value</th>
                          <th className="px-4 py-2 text-left font-medium">Primary Key</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tableStructure.columns?.map((column: any, index: number) => (
                          <tr key={index} className="border-b">
                            <td className="px-4 py-2 font-medium">{column.column_name}</td>
                            <td className="px-4 py-2 font-mono text-xs">{column.data_type}</td>
                            <td className="px-4 py-2">
                              {column.is_nullable === 'YES' ? (
                                <Badge variant="secondary">Yes</Badge>
                              ) : (
                                <Badge variant="outline">No</Badge>
                              )}
                            </td>
                            <td className="px-4 py-2 font-mono text-xs">
                              {column.column_default || '-'}
                            </td>
                            <td className="px-4 py-2">
                              {column.is_primary_key ? (
                                <Badge variant="default" className="bg-amber-500">Yes</Badge>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Indexes Section */}
                {tableStructure.indexes && tableStructure.indexes.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Indexes</h3>
                    <div className="border rounded-md overflow-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted">
                          <tr>
                            <th className="px-4 py-2 text-left font-medium">Index Name</th>
                            <th className="px-4 py-2 text-left font-medium">Columns</th>
                            <th className="px-4 py-2 text-left font-medium">Unique</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tableStructure.indexes.map((index: any, indexNum: number) => (
                            <tr key={indexNum} className="border-b">
                              <td className="px-4 py-2 font-medium">{index.indexname}</td>
                              <td className="px-4 py-2 font-mono text-xs">{parseIndexColumns(index.indexdef)}</td>
                              <td className="px-4 py-2">
                                {index.indisunique ? (
                                  <Badge variant="default">Yes</Badge>
                                ) : (
                                  <Badge variant="secondary">No</Badge>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Foreign Keys Section */}
                {tableStructure.foreignKeys && tableStructure.foreignKeys.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Foreign Keys</h3>
                    <div className="border rounded-md overflow-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted">
                          <tr>
                            <th className="px-4 py-2 text-left font-medium">Column</th>
                            <th className="px-4 py-2 text-left font-medium">References Table</th>
                            <th className="px-4 py-2 text-left font-medium">References Column</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tableStructure.foreignKeys.map((fk: any, index: number) => (
                            <tr key={index} className="border-b">
                              <td className="px-4 py-2 font-medium">{fk.column_name}</td>
                              <td className="px-4 py-2 font-mono text-xs">{fk.foreign_table_name}</td>
                              <td className="px-4 py-2 font-mono text-xs">{fk.foreign_column_name}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="sql" className="flex-1 overflow-auto mt-4">
            <div className="space-y-4">
              <div>
                <label htmlFor="sql-editor" className="block text-sm font-medium mb-2">
                  SQL Query
                </label>
                <Textarea
                  id="sql-editor"
                  value={sqlQuery}
                  onChange={(e) => setSqlQuery(e.target.value)}
                  placeholder="Enter your SQL query here..."
                  className="min-h-[200px] font-mono"
                  disabled={readOnly}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={executeSql}
                  disabled={!sqlQuery.trim() || isExecutingSql || readOnly}
                  className="flex items-center gap-2"
                >
                  {isExecutingSql && <RefreshCw className="h-4 w-4 animate-spin" />}
                  <Play className="h-4 w-4" />
                  Execute SQL
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSqlQuery("");
                    setSqlResults(null);
                  }}
                >
                  Clear
                </Button>
              </div>
              
              {sqlResults && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium mb-2">Results</h4>
                  <div className="border rounded-md overflow-auto max-h-96">
                    <table className="w-full text-sm">
                      <thead className="bg-muted">
                        <tr>
                          {sqlResults.result && Object.keys(sqlResults.result[0] || {}).map((key: string, index: number) => (
                            <th key={index} className="px-4 py-2 text-left font-medium border-b">
                              {key}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sqlResults.result?.map((row: any, rowIndex: number) => (
                          <tr key={rowIndex} className="border-b">
                            {Object.values(row).map((value: any, colIndex: number) => (
                              <td key={colIndex} className="px-4 py-2 font-mono text-xs">
                                {value === null || value === undefined ? (
                                  <span className="text-muted-foreground/50 italic">NULL</span>
                                ) : (
                                  String(value)
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {sqlResults.rowsAffected} row(s) affected
                  </p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
      
      {/* Pagination */}
      <div className="border-t bg-card/60 px-4 py-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {page * limit + 1} to {Math.min((page + 1) * limit, rowsData?.totalCount || 0)} of {rowsData?.totalCount || 0} rows
            {hasActiveFilters ? " for current filters" : ""}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || isLoadingRows}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={(rowsData?.rows.length || 0) < limit || isLoadingRows}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>
      
      {/* Delete Confirmation */}
      <AlertDialog open={!!rowToDelete} onOpenChange={(open) => !open && setRowToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete row from database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={(open) => !open && setShowBulkDeleteDialog(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Selected Rows?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete {selectedRows.size} row(s) from database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete {selectedRows.size} Row(s)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
