import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useConnectDb, getListConnectionsQueryKey } from "@workspace/api-client-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Database } from "lucide-react";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";

const connectSchema = z.object({
  name: z.string().optional(),
  connectionString: z.string().url("Must be a valid URL, e.g., postgresql://user:pass@host:5432/db"),
});

type ConnectValues = z.infer<typeof connectSchema>;

export function ConnectionDialog({ children }: { children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const connectMutation = useConnectDb();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<ConnectValues>({
    resolver: zodResolver(connectSchema),
    defaultValues: {
      name: "",
      connectionString: "",
    },
  });

  const onSubmit = (values: ConnectValues) => {
    connectMutation.mutate(
      { data: values },
      {
        onSuccess: (connection) => {
          queryClient.invalidateQueries({ queryKey: getListConnectionsQueryKey() });
          toast({
            title: "Connection successful",
            description: `Connected to ${connection.databaseName}`,
          });
          setOpen(false);
          form.reset();
          setTestResult(null);
        },
        onError: (error: any) => {
          toast({
            variant: "destructive",
            title: "Connection failed",
            description: error?.message || "Could not connect to database",
          });
        },
      }
    );
  };

  const onTestConnection = async () => {
    const connectionString = form.getValues("connectionString");
    
    if (!connectionString) {
      setTestResult({ success: false, message: "Connection string is required" });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const response = await fetch("/api/connections/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ connectionString }),
      });

      const data = await response.json();

      if (response.ok) {
        setTestResult({ 
          success: true, 
          message: data.message || "Connection successful" 
        });
      } else {
        setTestResult({ 
          success: false, 
          message: data.message || data.error || "Connection test failed" 
        });
      }
    } catch (error: any) {
      setTestResult({ 
        success: false, 
        message: error?.message || "Connection test failed" 
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button data-testid="button-new-connection">
            <Plus className="mr-2 h-4 w-4" />
            New Connection
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            Connect to Database
          </DialogTitle>
          <DialogDescription>
            Enter your PostgreSQL connection string. Credentials are encrypted and stored securely.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <Label>Name (Optional)</Label>
                  <FormControl>
                    <Input placeholder="Production DB" {...field} data-testid="input-conn-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="connectionString"
              render={({ field }) => (
                <FormItem>
                  <Label>Connection String</Label>
                  <FormControl>
                    <div className="space-y-2">
                      <Input
                        type="password"
                        placeholder="postgresql://user:password@host:5432/dbname"
                        {...field}
                        data-testid="input-conn-string"
                        onChange={(e) => {
                          field.onChange(e);
                          setTestResult(null); // Clear test result when connection string changes
                        }}
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={onTestConnection}
                          disabled={!field.value || isTesting}
                          data-testid="button-test-connection"
                        >
                          {isTesting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Test Connection
                        </Button>
                        {testResult && (
                          <div className="flex items-center gap-2 text-sm">
                            {testResult.success ? (
                              <>
                                <div className="w-2 h-2 bg-green-500 rounded-full" />
                                <span className="text-green-600">{testResult.message}</span>
                              </>
                            ) : (
                              <>
                                <div className="w-2 h-2 bg-red-500 rounded-full" />
                                <span className="text-red-600">{testResult.message}</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                data-testid="button-cancel-conn"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={connectMutation.isPending} data-testid="button-submit-conn">
                {connectMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Connect & Save
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
