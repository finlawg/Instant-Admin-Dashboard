import { useListConnections } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Database, Plus, Server, Clock } from "lucide-react";
import { ConnectionDialog } from "@/components/connection-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";

export default function ConnectionsPage() {
  const { data: connections, isLoading } = useListConnections();

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Database Connections</h1>
          <p className="text-muted-foreground mt-1">Manage your PostgreSQL databases securely.</p>
        </div>
        <ConnectionDialog />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-5 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-full mt-4" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : connections?.length === 0 ? (
        <Card className="bg-background border-dashed shadow-none text-center py-12">
          <CardContent className="flex flex-col items-center">
            <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <Database className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-medium mb-2">No connections yet</h3>
            <p className="text-muted-foreground max-w-sm mb-6">
              Add your first PostgreSQL connection string to start browsing and editing tables.
            </p>
            <ConnectionDialog>
              <Button size="lg" data-testid="button-empty-new-conn">
                <Plus className="mr-2 h-5 w-5" />
                Add Connection
              </Button>
            </ConnectionDialog>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {connections?.map((conn) => (
            <Card key={conn.id} className="group hover:border-primary/50 transition-colors">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Database className="h-5 w-5 text-primary" />
                  <span className="truncate">{conn.name || conn.databaseName}</span>
                </CardTitle>
                <CardDescription className="flex flex-col gap-1.5 mt-2">
                  <span className="flex items-center gap-1.5 text-xs truncate">
                    <Server className="h-3.5 w-3.5" />
                    {conn.host}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs">
                    <Clock className="h-3.5 w-3.5" />
                    Added {formatDistanceToNow(new Date(conn.createdAt))} ago
                  </span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link href={`/connections/${conn.id}`} className="w-full">
                  <Button 
                    variant="secondary" 
                    className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                    data-testid={`button-connect-${conn.id}`}
                  >
                    Open Console
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
