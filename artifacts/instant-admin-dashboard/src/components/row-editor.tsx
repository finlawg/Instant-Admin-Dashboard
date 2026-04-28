import { useState, useEffect } from "react";
import { useCreateRow, useUpdateRow } from "@workspace/api-client-react";
import { ColumnInfo } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Key } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";

interface RowEditorDialogProps {
  connectionId: number;
  table: string;
  columns: ColumnInfo[];
  mode: "create" | "edit";
  initialData?: Record<string, any>;
  onSuccess: () => void;
  children: React.ReactNode;
}

export function RowEditorDialog({
  connectionId,
  table,
  columns,
  mode,
  initialData,
  onSuccess,
  children,
}: RowEditorDialogProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const createMutation = useCreateRow();
  const updateMutation = useUpdateRow();

  // state to hold form values
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [nullFields, setNullFields] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      if (mode === "edit" && initialData) {
        const initialNulls = new Set<string>();
        Object.entries(initialData).forEach(([key, val]) => {
          if (val === null) initialNulls.add(key);
        });
        setFormData(initialData);
        setNullFields(initialNulls);
      } else {
        setFormData({});
        setNullFields(new Set());
      }
    }
  }, [open, mode, initialData]);

  const handleInputChange = (name: string, value: any) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (nullFields.has(name)) {
      const newNulls = new Set(nullFields);
      newNulls.delete(name);
      setNullFields(newNulls);
    }
  };

  const handleSetNull = (name: string, isNull: boolean) => {
    const newNulls = new Set(nullFields);
    if (isNull) {
      newNulls.add(name);
    } else {
      newNulls.delete(name);
    }
    setNullFields(newNulls);
  };

  const onSubmit = () => {
    const values: Record<string, any> = {};
    columns.forEach((col) => {
      // For create, skip fields that aren't touched if they have default (unless explicitly set to null)
      if (mode === "create" && !(col.name in formData) && !nullFields.has(col.name) && col.hasDefault) {
        return; 
      }
      
      if (nullFields.has(col.name)) {
        values[col.name] = null;
      } else {
        // coerce types simply based on input string (HTML inputs are strings)
        // for real apps, better type casting is needed based on dataType
        let val = formData[col.name];
        
        if (col.dataType.includes("int") || col.dataType.includes("numeric") || col.dataType.includes("float")) {
           val = val === "" || val === undefined ? null : Number(val);
        } else if (col.dataType.includes("bool")) {
           val = val === "true" || val === true;
        }
        
        values[col.name] = val;
      }
    });

    if (mode === "create") {
      createMutation.mutate(
        { params: { connectionId, table }, data: { values } },
        {
          onSuccess: () => {
            toast({ title: "Row created successfully" });
            setOpen(false);
            onSuccess();
          },
          onError: (err: any) => {
            toast({ variant: "destructive", title: "Failed to create row", description: err.message });
          }
        }
      );
    } else {
      // primary keys needed
      const primaryKeys = columns.filter(c => c.isPrimaryKey).map(c => c.name);
      if (primaryKeys.length === 0) {
        toast({ variant: "destructive", title: "Cannot update row", description: "Table has no primary key" });
        return;
      }
      const pkObj: Record<string, any> = {};
      primaryKeys.forEach(k => { pkObj[k] = initialData?.[k]; });

      updateMutation.mutate(
        { params: { connectionId, table }, data: { primaryKey: pkObj, values } },
        {
          onSuccess: () => {
            toast({ title: "Row updated successfully" });
            setOpen(false);
            onSuccess();
          },
          onError: (err: any) => {
            toast({ variant: "destructive", title: "Failed to update row", description: err.message });
          }
        }
      );
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? `Add Row to ${table}` : `Edit Row in ${table}`}</DialogTitle>
          <DialogDescription>
            {mode === "create" ? "Enter values for the new row." : "Modify values for this row."}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4 -mr-4">
          <div className="space-y-4 py-4">
            {columns.map((col) => {
              const isNull = nullFields.has(col.name);
              const isReadOnly = mode === "edit" && col.isPrimaryKey;
              
              return (
                <div key={col.name} className="grid gap-2 p-3 border rounded-md bg-secondary/20">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5 font-mono text-sm font-semibold">
                      {col.isPrimaryKey && <Key className="h-3 w-3 text-amber-500" />}
                      {col.name}
                      <span className="text-xs text-muted-foreground font-normal ml-2">
                        {col.dataType}
                      </span>
                    </Label>
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id={`null-${col.name}`} 
                        checked={isNull} 
                        disabled={!col.nullable || isReadOnly}
                        onCheckedChange={(c) => handleSetNull(col.name, !!c)}
                      />
                      <label
                        htmlFor={`null-${col.name}`}
                        className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        NULL
                      </label>
                    </div>
                  </div>
                  <Input
                    value={formData[col.name] ?? ""}
                    onChange={(e) => handleInputChange(col.name, e.target.value)}
                    disabled={isNull || isReadOnly}
                    placeholder={col.hasDefault ? "DEFAULT" : ""}
                    className="font-mono text-sm"
                  />
                  {col.isPrimaryKey && mode === "edit" && (
                    <p className="text-xs text-muted-foreground">Primary keys cannot be edited.</p>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter className="pt-4 border-t mt-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={onSubmit} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
