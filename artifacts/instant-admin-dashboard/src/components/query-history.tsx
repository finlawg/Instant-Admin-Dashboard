import { useListQueryHistory } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, CheckCircle, XCircle, Database, Code } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface QueryHistoryProps {
  connectionId: number;
}

export default function QueryHistory({ connectionId }: QueryHistoryProps) {
  const { data: history, isLoading } = useListQueryHistory(
    { connectionId },
    { query: { enabled: !!connectionId, queryKey: ['queryHistory', connectionId] } }
  );

  // Filter to only show saved queries and CRUD operations
  const filteredHistory = history?.filter(item => 
    item.action === 'run_saved_query' ||
    item.action === 'create_row' ||
    item.action === 'update_row' ||
    item.action === 'delete_row'
  );

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'create_row':
      case 'update_row':
      case 'delete_row':
        return <Database className="h-4 w-4" />;
      case 'run_saved_query':
        return <Code className="h-4 w-4" />;
      default:
        return <Database className="h-4 w-4" />;
    }
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'create_row':
        return 'Create Row';
      case 'update_row':
        return 'Update Row';
      case 'delete_row':
        return 'Delete Row';
      case 'run_saved_query':
        return 'Run Query';
      default:
        return action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Query History</h3>
        <p className="text-sm text-muted-foreground">
          Recent database operations and queries for this connection.
        </p>
      </div>

      <div className="space-y-2">
        {isLoading ? (
          Array.from({ length: 10 }).map((_, i) => (
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
        ) : filteredHistory?.length === 0 ? (
          <Card className="bg-muted/30 border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-8 text-center">
              <Clock className="h-12 w-12 text-muted-foreground mb-3" />
              <h4 className="font-medium mb-2">No query history</h4>
              <p className="text-sm text-muted-foreground mb-4">
                Your saved queries and CRUD operations will appear here.
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredHistory?.map((item) => (
            <Card key={item.id} className="hover:shadow-sm transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base flex items-center gap-2">
                      {getActionIcon(item.action)}
                      {getActionLabel(item.action)}
                    </CardTitle>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(item.createdAt))} ago
                    </div>
                  </div>
                  <Badge 
                    variant={item.status === 'success' ? 'default' : 'destructive'}
                    className="flex items-center gap-1"
                  >
                    {item.status === 'success' ? (
                      <CheckCircle className="h-3 w-3" />
                    ) : (
                      <XCircle className="h-3 w-3" />
                    )}
                    {item.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="text-sm">
                    <Badge variant="outline" className="font-mono text-xs">
                      SQL
                    </Badge>
                  </div>
                  <pre className="text-xs bg-muted/50 p-2 rounded overflow-x-auto whitespace-pre-wrap font-mono">
                    {item.sql}
                  </pre>
                  {item.error && (
                    <div className="mt-2 p-2 bg-destructive/10 border border-destructive/20 rounded">
                      <p className="text-xs text-destructive font-mono">{item.error}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
