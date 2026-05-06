import { useState } from "react";
import { Wand2, Copy, ExternalLink, Check } from "lucide-react";

interface ChatGPTPromptProps {
  title?: string;
  promptText: string;
}

export default function ChatGPTPrompt({
  title = "Generate Plan",
  promptText,
}: ChatGPTPromptProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(promptText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement("textarea");
      textarea.value = promptText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const openChatGPT = () => {
    window.open("https://chat.openai.com", "_blank");
  };

  return (
    <div className="card-surface p-4 mt-4">
      <div className="flex items-center gap-2 mb-3">
        <Wand2 size={16} className="text-[#9a7bbd]" />
        <span className="text-sm font-semibold text-[#25313c]">{title}</span>
      </div>
      <div className="bg-[#f0ebe2] rounded p-3 mb-3 max-h-[200px] overflow-y-auto">
        <pre className="font-mono-data text-xs text-[#6f685f] whitespace-pre-wrap">
          {promptText}
        </pre>
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleCopy}
          className={`flex items-center gap-2 px-4 py-2 rounded text-sm font-medium transition-all ${
            copied
              ? "bg-[#6a9a74]/20 text-[#6a9a74]"
              : "bg-[#6b87ae] hover:bg-[#5e7ea4] text-white"
          }`}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied!" : "Copy Prompt"}
        </button>
        <button
          onClick={openChatGPT}
          className="btn-secondary flex items-center gap-2"
        >
          <ExternalLink size={14} />
          Open ChatGPT
        </button>
      </div>
    </div>
  );
}
