import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Film, Sparkles, Upload } from 'lucide-react';

import { SELECTABLE_AGENT_MODEL_OPTIONS } from '@/lib/agent-settings';
import { m } from '@/paraglide/messages.js';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export const Route = createFileRoute('/(agent)/editor')({
  component: EditorPage,
});

// Mirrors the composer's model picker.
const MODELS = SELECTABLE_AGENT_MODEL_OPTIONS.map((option) => ({
  id: option.value,
  name: option.label,
}));

function EditorPage() {
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState(MODELS[0].id);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {m['agent.editor.title']()}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {m['agent.editor.description']()}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        {/* Opening frame */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {m['agent.editor.frame_title']()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <label
              className="border-border bg-muted/30 hover:bg-muted/50 flex h-80 w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed text-center transition-colors"
              htmlFor="upload"
            >
              <Upload className="text-muted-foreground size-8" />
              <div>
                <p className="text-foreground text-sm font-medium">
                  {m['agent.editor.upload_label']()}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {m['agent.editor.upload_hint']()}
                </p>
              </div>
              <input
                id="upload"
                type="file"
                accept="image/*"
                className="hidden"
              />
            </label>
          </CardContent>
        </Card>

        {/* Prompt panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="text-primary size-4" />
              {m['agent.editor.prompt_label']()}
            </CardTitle>
            <CardDescription>{m['agent.editor.model_label']()}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select
              items={MODELS.map((mo) => ({ label: mo.name, value: mo.id }))}
              value={model}
              onValueChange={(v) => v && setModel(v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODELS.map((mo) => (
                  <SelectItem key={mo.id} value={mo.id}>
                    {mo.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={m['agent.editor.prompt_placeholder']()}
            />

            <Button className="w-full gap-2" disabled={!prompt.trim()}>
              <Film className="size-4" />
              {m['agent.editor.submit']()}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {m['agent.editor.history']()}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border-border text-muted-foreground rounded-lg border border-dashed p-12 text-center text-sm">
            {m['agent.editor.empty_history']()}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
