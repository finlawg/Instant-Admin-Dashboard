import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useListTables, useListConnections, useUpdateConnection } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Database, Table as TableIcon, ChevronLeft, Search, Code, Lock, Clock, Loader2, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import TableViewer from "@/components/table-viewer";
import SavedQueries from "@/components/saved-queries";
import QueryHistory from "@/components/query-history";

export default function ConnectionPage() {
  const params = useParams<{ id: string }>();
  const connectionId = Number(params.id);
const [location, setLocation] = useLocation();
const [searchQuery, setSearchQuery] = useState("");
const [localReadOnly, setLocalReadOnly] = useState(false);
const [sqlQuery, setSqlQuery] = useState("");
const [queryResults, setQueryResults] = useState<any>(null);
const [queryError, setQueryError] = useState<string | null>(null);
const [isQueryLoading, setIsQueryLoading] = useState(false);
  
  // SQL Import state
  const [showSqlImportDialog, setShowSqlImportDialog] = useState(false);
  const [sqlFile, setSqlFile] = useState<File | null>(null);
  const [sqlContent, setSqlContent] = useState("");
  const [isSqlImporting, setIsSqlImporting] = useState(false);

const [, forceUpdate] = useState(0);
const selectedTable = new URLSearchParams(window.location.search).get("table");

  const { data: tablesResponse, isLoading: isLoadingTables } = useListTables(
    { connectionId },
    { query: { enabled: !!connectionId, queryKey: ['tables', connectionId] } }
  );

  const { data: connections } = useListConnections();
  const connection = connections?.find((c) => c.id === connectionId);
  const updateMutation = useUpdateConnection();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Sync local state with connection data
  useEffect(() => {
    if (connection) {
      setLocalReadOnly(connection.readOnly);
    }
  }, [connection]);

  const filteredTables = tablesResponse?.tables.filter((t) =>
    t.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleReadOnlyToggle = (checked: boolean) => {
    const previousReadOnly = localReadOnly;
    
    // Immediately update local state (optimistic update)
    setLocalReadOnly(checked);

    // Show success toast immediately
    toast({
      title: checked ? "Read-only mode enabled" : "Read-only mode disabled",
      description: checked 
        ? "All write operations are now blocked for this connection." 
        : "Write operations are now allowed for this connection."
    });

    // Make the API call
    updateMutation.mutate(
      { connectionId, data: { readOnly: checked } },
      {
        onSuccess: () => {
          // Update the query client data to match the successful API response
          queryClient.setQueryData(['listConnections'], (oldData: any) => {
            if (!oldData) return oldData;
            return oldData.map((conn: any) => 
              conn.id === connectionId 
                ? { ...conn, readOnly: checked }
                : conn
            );
          });
        },
        onError: (err: any) => {
          // Revert local state on error
          setLocalReadOnly(previousReadOnly);
          
          toast({
            variant: "destructive",
            title: "Failed to update connection",
            description: err.message
          });
        }
      }
    );
  };

  const handleRunQuery = async () => {
    if (!sqlQuery.trim()) return;
    
    setIsQueryLoading(true);
    setQueryError(null);
    setQueryResults(null);
    
    try {
      const startTime = Date.now();
      const response = await fetch(`/api/connections/${connectionId}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sql: sqlQuery }),
      });
      
      const data = await response.json();
      const executionTime = Date.now() - startTime;
      
      if (data.error) {
        setQueryError(data.error);
      } else {
        setQueryResults({
          ...data,
          executionTime,
        });
      }
    } catch (error) {
      setQueryError(error instanceof Error ? error.message : 'Failed to execute query');
    } finally {
      setIsQueryLoading(false);
    }
  };

  const handleSaveQuery = () => {
    toast({
      title: "Save Query",
      description: "Please use the Saved Queries tab to save your query",
    });
  };

  const handleSqlFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSqlFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setSqlContent(content);
      };
      reader.readAsText(file);
    }
  };

  const handleSqlImport = async () => {
    if (!sqlContent.trim()) return;
    
    setIsSqlImporting(true);
    try {
      const response = await fetch(`/api/connections/${connectionId}/execute-sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sql: sqlContent }),
      });
      
      const result = await response.json();
      
      if (response.ok) {
        toast({
          title: "SQL Import Successful",
          description: result.message || "SQL script executed successfully",
        });
      } else {
        throw new Error(result.error || 'SQL import failed');
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "SQL Import Failed",
        description: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    } finally {
      setIsSqlImporting(false);
      setShowSqlImportDialog(false);
      setSqlFile(null);
      setSqlContent("");
    }
  };

  return (
    <div className="flex h-full w-full bg-background overflow-hidden">
      {/* Tables Sidebar */}
      <div className="w-64 border-r bg-card flex flex-col shrink-0">
        <div className="h-14 flex items-center px-4 border-b">
          <Link href="/connections">
            <Button variant="ghost" size="icon" className="mr-2 h-8 w-8 text-muted-foreground">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="font-medium truncate flex-1 flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            {connection?.name || connection?.databaseName || "Database"}
          </div>
        </div>

        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tables..."
              className="pl-8 h-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {connection && (
          <div className="p-3 border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor="read-only-toggle" className="text-sm font-medium">
                  Read-only Mode
                </Label>
              </div>
              <Switch
                id="read-only-toggle"
                checked={localReadOnly}
                onCheckedChange={handleReadOnlyToggle}
                disabled={updateMutation.isPending}
              />
            </div>
            {localReadOnly && (
              <p className="text-xs text-muted-foreground mt-2">
                Write operations are blocked for this connection.
              </p>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {isLoadingTables ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-md" />
            ))
          ) : filteredTables?.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No tables found
            </div>
          ) : (
            filteredTables?.map((table) => (
              <Button
                key={table}
                variant={selectedTable === table ? "secondary" : "ghost"}
                className={`w-full justify-start text-sm ${
                  selectedTable === table
                    ? "bg-primary/10 text-primary hover:bg-primary/20"
                    : "text-foreground/80"
                }`}
                onClick={() => {
                setLocation(`/connections/${connectionId}?table=${encodeURIComponent(table)}`);
                  forceUpdate(n => n + 1);
                }}
                data-testid={`link-table-${table}`}
              >
                <TableIcon className="mr-2 h-4 w-4 opacity-70" />
                <span className="truncate">{table}</span>
              </Button>
            ))
          )}
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-background">
        <Tabs defaultValue="tables" className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-4 h-12 shrink-0">
            <TabsTrigger value="tables" className="flex items-center gap-2">
              <TableIcon className="h-4 w-4" />
              Tables
            </TabsTrigger>
            <TabsTrigger value="editor" className="flex items-center gap-2">
              <Code className="h-4 w-4" />
              SQL Editor
            </TabsTrigger>
            <TabsTrigger value="queries" className="flex items-center gap-2">
              <Code className="h-4 w-4" />
              Saved Queries
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Query History
            </TabsTrigger>
          </TabsList>
        
        {/* SQL Import Button */}
        <div className="px-4 py-2 border-b">
          <Dialog open={showSqlImportDialog} onOpenChange={setShowSqlImportDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Upload className="mr-2 h-4 w-4" />
                Import SQL
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Import SQL Script</DialogTitle>
                <DialogDescription>
                  Upload a .sql file or paste SQL directly to execute on the database.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label htmlFor="sql-file" className="block text-sm font-medium mb-2">
                    Select SQL File (.sql)
                  </label>
                  <input
                    id="sql-file"
                    type="file"
                    accept=".sql"
                    onChange={handleSqlFileChange}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                  />
                </div>
                
                <div>
                  <label htmlFor="sql-content" className="block text-sm font-medium mb-2">
                    Or paste SQL directly:
                  </label>
                  <textarea
                    id="sql-content"
                    value={sqlContent}
                    onChange={(e) => setSqlContent(e.target.value)}
                    placeholder="Paste your SQL script here..."
                    className="w-full h-32 p-3 border rounded-md font-mono text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowSqlImportDialog(false);
                    setSqlFile(null);
                    setSqlContent("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSqlImport}
                  disabled={!sqlContent.trim() || isSqlImporting}
                >
                  {isSqlImporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Execute SQL
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
          
          <TabsContent value="tables" className="flex-1 overflow-hidden">
            {selectedTable ? (
              <TableViewer connectionId={connectionId} table={selectedTable} readOnly={localReadOnly} />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
                <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center mb-4">
                  <TableIcon className="h-8 w-8 opacity-50" />
                </div>
                <h2 className="text-xl font-semibold text-foreground mb-2">Select a Table</h2>
                <p className="max-w-sm">
                  Choose a table from the sidebar to view its columns, query data, and make edits.
                </p>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="editor" className="flex-1 overflow-auto p-4">
            <div className="flex flex-col h-full space-y-4">
              {/* SQL Editor */}
              <div className="flex-1 flex flex-col space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">SQL Editor</h3>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSaveQuery}
                      disabled={!sqlQuery.trim()}
                    >
                      Save Query
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleRunQuery}
                      disabled={!sqlQuery.trim() || isQueryLoading}
                    >
                      {isQueryLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Run Query
                    </Button>
                  </div>
                </div>
                <textarea
                  value={sqlQuery}
                  onChange={(e) => setSqlQuery(e.target.value)}
                  placeholder="Enter your SQL query here..."
                  className="flex-1 w-full h-64 p-3 border rounded-md font-mono text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              
              {/* Query Results */}
              {queryResults && (
                <div className="flex-1 flex flex-col space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-md font-semibold">
                      Results ({queryResults.rowCount || 0} rows, {queryResults.executionTime}ms)
                    </h4>
                  </div>
                  <div className="border rounded-md overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted">
                        <tr>
                          {queryResults.columns?.map((col: any, index: number) => (
                            <th key={index} className="px-4 py-2 text-left font-medium border-b">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {queryResults.rows?.map((row: any, rowIndex: number) => (
                          <tr key={rowIndex} className="border-b">
                            {queryResults.columns?.map((col: any, colIndex: number) => (
                              <td key={colIndex} className="px-4 py-2">
                                {row[col]?.toString() || ''}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              
              {/* Query Error */}
              {queryError && (
                <div className="p-4 border border-red-200 bg-red-50 rounded-md">
                  <h4 className="text-red-800 font-semibold mb-2">Query Error</h4>
                  <p className="text-red-700 text-sm">{queryError}</p>
                </div>
              )}
            </div>
          </TabsContent>
          
          <TabsContent value="queries" className="flex-1 overflow-auto">
            <SavedQueries connectionId={connectionId} />
          </TabsContent>
          
          <TabsContent value="history" className="flex-1 overflow-auto">
            <QueryHistory connectionId={connectionId} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
