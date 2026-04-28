import { useState } from "react";
import {
  useListSavedQueries,
  useCreateSavedQuery,
  useDeleteSavedQuery,
  useRunSavedQuery,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  Play,
  Save,
  Trash2,
  Plus,
  Code,
  Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

interface SavedQueriesProps {
  connectionId: number;
}

export default function SavedQueries({ connectionId }: SavedQueriesProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [queryName, setQueryName] = useState("");
  const [querySql, setQuerySql] = useState("");
  const [queryToDelete, setQueryToDelete] = useState<number | null>(null);
  const [queryResults, setQueryResults] = useState<any>(null);
  const [isResultsDialogOpen, setIsResultsDialogOpen] = useState(false);

  const { toast } = useToast();

  const { data: savedQueries, isLoading, refetch } = useListSavedQueries(
    { connectionId },
    { query: { enabled: !!connectionId, queryKey: ['savedQueries', connectionId] } }
  );

  const createMutation = useCreateSavedQuery();
  const deleteMutation = useDeleteSavedQuery();
  const runMutation = useRunSavedQuery();

  const handleCreateQuery = () => {
    if (!queryName.trim() || !querySql.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Query name and SQL are required.",
      });
      return;
    }

    createMutation.mutate(
      {
        data: {
          connectionId,
          name: queryName.trim(),
          sql: querySql.trim(),
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Query saved successfully" });
          setQueryName("");
          setQuerySql("");
          setIsCreateDialogOpen(false);
          refetch();
        },
        onError: (err: any) => {
          toast({
            variant: "destructive",
            title: "Failed to save query",
            description: err.message,
          });
        },
      }
    );
  };

  const handleDeleteQuery = () => {
    if (!queryToDelete) return;

    deleteMutation.mutate(
     { queryId: queryToDelete },
      {
        onSuccess: () => {
          toast({ title: "Query deleted successfully" });
          setQueryToDelete(null);
          refetch();
        },
        onError: (err: any) => {
          toast({
            variant: "destructive",
            title: "Failed to delete query",
            description: err.message,
          });
          setQueryToDelete(null);
        },
      }
    );
  };

  const handleRunQuery = (queryId: number) => {
    runMutation.mutate(
      { queryId: Number(queryId) },
      {
        onSuccess: (data) => {
          setQueryResults(data);
          setIsResultsDialogOpen(true);
          toast({ title: "Query executed successfully" });
        },
        onError: (err: any) => {
          toast({
            variant: "destructive",
            title: "Failed to run query",
            description: err.message,
          });
        },
      }
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Saved Queries</h3>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              New Query
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Saved Query</DialogTitle>
              <DialogDescription>
                Write a read-only SQL query to save and reuse later.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label htmlFor="query-name" className="text-sm font-medium">
                  Query Name
                </label>
                <Input
                  id="query-name"
                  placeholder="e.g., Active Users This Month"
                  value={queryName}
                  onChange={(e) => setQueryName(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <label htmlFor="query-sql" className="text-sm font-medium">
                  SQL Query
                </label>
                <Textarea
                  id="query-sql"
                  placeholder="SELECT * FROM users WHERE created_at >= NOW() - INTERVAL '30 days';"
                  value={querySql}
                  onChange={(e) => setQuerySql(e.target.value)}
                  className="mt-1 font-mono"
                  rows={8}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsCreateDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateQuery}
                disabled={createMutation.isPending}
              >
                <Save className="mr-2 h-4 w-4" />
                {createMutation.isPending ? "Saving..." : "Save Query"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-5 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))
        ) : savedQueries?.length === 0 ? (
          <Card className="bg-muted/30 border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-8 text-center">
              <Code className="h-12 w-12 text-muted-foreground mb-3" />
              <h4 className="font-medium mb-2">No saved queries</h4>
              <p className="text-sm text-muted-foreground mb-4">
                Create your first saved query to quickly run common SQL queries.
              </p>
            </CardContent>
          </Card>
        ) : (
          savedQueries?.map((query) => (
            <Card key={query.id} className="hover:shadow-sm transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base">{query.name}</CardTitle>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(query.createdAt))} ago
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRunQuery(query.id)}
                      disabled={runMutation.isPending}
                      title="Run query"
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setQueryToDelete(query.id)}
                      title="Delete query"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="text-sm">
                    <Badge variant="secondary" className="font-mono text-xs">
                      SQL
                    </Badge>
                  </div>
                  <pre className="text-xs bg-muted/50 p-2 rounded overflow-x-auto whitespace-pre-wrap">
                    {query.sql}
                  </pre>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!queryToDelete} onOpenChange={(open) => !open && setQueryToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Saved Query</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this saved query? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteQuery}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Query Results Dialog */}
      <Dialog open={isResultsDialogOpen} onOpenChange={setIsResultsDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Query Results</DialogTitle>
            <DialogDescription>
              Results from your saved query execution.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {queryResults && (
              <div className="border rounded-md">
                <div className="bg-muted/50 p-3 border-b">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {queryResults.rows.length} rows
                    </Badge>
                    <Badge variant="outline">
                      {queryResults.columns.length} columns
                    </Badge>
                  </div>
                </div>
                <div className="overflow-auto max-h-[60vh]">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30 sticky top-0">
                      <tr>
                        {queryResults.columns.map((column: string) => (
                          <th
                            key={column}
                            className="px-4 py-2 text-left font-medium border-b"
                          >
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {queryResults.rows.map((row: any, index: number) => (
                        <tr key={index} className="hover:bg-muted/20">
                          {queryResults.columns.map((column: string) => (
                            <td
                              key={column}
                              className="px-4 py-2 border-b font-mono text-xs"
                            >
                              {row[column] === null ? (
                                <span className="text-muted-foreground italic">NULL</span>
                              ) : (
                                String(row[column])
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setIsResultsDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
