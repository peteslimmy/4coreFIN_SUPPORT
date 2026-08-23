import { useState, useEffect, useCallback, useRef, type KeyboardEvent } from 'react';
import {
  Button,
  Input,
  Label,
  Separator,
  useToast,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Textarea,
  Badge,
} from '../components/ui';
import { api } from '../lib/api';
import { MessageCircle, Search, Settings, ClipboardList, RefreshCw, Copy, X, CheckCircle2 } from 'lucide-react';
import PageTransition from '../components/layout/PageTransition';
import PageContainer from '../components/layout/PageContainer';
import PageHeader from '../components/layout/PageHeader';

export default function AICopilotPage() {
  const { toast } = useToast();
  const [analyzeResult, setAnalyzeResult] = useState<string | null>(null);
  const [classifyResult, setClassifyResult] = useState<any | null>(null);
  const [rcaResult, setRcaResult] = useState<any | null>(null);
  const [chatHistory, setChatHistory] = useState<Array<{ role: string; text: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [generatingRCA, setGeneratingRCA] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const [analyzeInput, setAnalyzeInput] = useState('');
  const [classifyDescription, setClassifyDescription] = useState('');
  const [classifyCategories, setClassifyCategories] = useState<any>(null);
  const [rcaTicketDetails, setRcaTicketDetails] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'analyze' | 'classify' | 'rca' | 'chat'>('chat');
  const [isCopypasting, setIsCopypasting] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'none' | 'copying' | 'copied'>('none');

  // Sample ticket data for RCA
  const sampleTicketDetails = {
    id: 'TKT-001',
    category: 'Payment',
    issueType: 'Duplicate Debit',
    partner: 'Parkway',
    provider: 'Adyen',
    bu: 'Payments',
    description: 'Customer reported being charged twice for the same transaction on 2026-08-20. The duplicate charge caused an overdraft fee.',
  };

  useEffect(() => {
    // Initialize with a welcome message
    if (chatHistory.length === 0) {
      setChatHistory([
        {
          role: 'assistant',
          text: 'Hello! I am your AI Copilot for payment operations. I can help you analyze payment issues, classify tickets, perform root cause analysis, and answer questions about payment operations. How can I assist you today?',
        },
      ]);
    }
  }, []);

  const handleAnalyze = async () => {
    if (!analyzeInput.trim()) {
      toast.error('Please enter text to analyze');
      return;
    }

    setAnalyzing(true);
    setAnalyzeResult(null);
    try {
      const result = await api.geminiAnalyze({
        prompt: analyzeInput,
      }) as { text?: string };
      setAnalyzeResult(result.text || '');
      toast.success('Analysis complete');
    } catch (error: any) {
      toast.error(`Analysis failed: ${error.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleClassify = async () => {
    if (!classifyDescription.trim()) {
      toast.error('Please enter a ticket description to classify');
      return;
    }

    setClassifying(true);
    setClassifyResult(null);
    try {
      // Prepare categories if provided, otherwise use empty object
      const categories = classifyCategories ? JSON.parse(classifyCategories) : {};
      const result = await api.geminiClassify(classifyDescription, categories) as { data?: any };
      setClassifyResult(result.data);
      toast.success('Classification complete');
    } catch (error: any) {
      toast.error(`Classification failed: ${error.message}`);
    } finally {
      setClassifying(false);
    }
  };

  const handleGenerateRCA = async () => {
    setGeneratingRCA(true);
    setRcaResult(null);
    try {
      const ticketData = rcaTicketDetails ? JSON.parse(rcaTicketDetails) : sampleTicketDetails;
      const result = await api.geminiRca({ ticketDetails: ticketData }) as { data?: any };
      setRcaResult(result.data);
      toast.success('RCA generated');
    } catch (error: any) {
      toast.error(`RCA generation failed: ${error.message}`);
    } finally {
      setGeneratingRCA(false);
    }
  };

  const handleChatSubmit = async () => {
    if (!chatInput.trim()) return;

    const input = chatInput.trim();
    setChatHistory([
      ...chatHistory,
      { role: 'user', text: input },
    ]);
    setChatInput('');

    setChatSending(true);
    try {
      const result = await api.geminiChat(input, chatHistory) as { text?: string };
      setChatHistory([
        ...chatHistory,
        { role: 'assistant', text: result.text || '' },
      ]);
      // Scroll to bottom
      const chatContainer = document.getElementById('chat-container');
      if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
    } catch (error: any) {
      toast.error(`Chat failed: ${error.message}`);
      // Remove the user message on error
      setChatHistory(chatHistory.slice(0, -1));
    } finally {
      setChatSending(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChatSubmit();
    }
  };

  const handleCopyResult = async (text: string) => {
    setIsCopypasting(true);
    setCopyStatus('copying');
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus('copied');
      toast.success('Copied to clipboard');
    } catch (err) {
      setCopyStatus('none');
      toast.error('Failed to copy to clipboard');
    } finally {
      setTimeout(() => {
        setIsCopypasting(false);
        setCopyStatus('none');
      }, 1500);
    }
  };

  const handleUseSampleData = () => {
    setRcaTicketDetails(JSON.stringify(sampleTicketDetails, null, 2));
  };

  if (activeTab === 'chat') {
    return (
      <div className="flex-1 flex flex-col p-4">
        {/* Header */}
        <div className="flex flex-col gap-4 mb-4">
          <h1 className="text-2xl font-bold">AI Copilot Chat</h1>
          <p className="text-caption text-text-muted">
            Ask me anything about payment operations, ticket analysis, or get help with investigations
          </p>
        </div>

        {/* Chat messages */}
        <div className="flex-1 min-h-0 overflow-y-auto" id="chat-container">
          {chatHistory.map((message, index) => (
            <div
              key={index}
              className={`flex flex-col gap-2 mb-4 ${
                message.role === 'user' ? 'ml-auto' : 'mr-auto'
              } max-w-[80%]`}
            >
              <div className={`flex items-start gap-2 ${
                message.role === 'user'
                  ? 'bg-accent/20 rounded-lg p-3'
                  : 'bg-surface-card/50 backdrop-blur-sm rounded-lg p-3'
              }`}>
                {message.role === 'user' ? (
                  <MessageCircle className="h-4 w-4 text-accent" />
                ) : (
                  <MessageCircle className="h-4 w-4 text-muted" />
                )}
                <div className="flex-1 min-w-0 whitespace-pre-wrap">
                  {message.text}
                </div>
              </div>
              {message.role === 'assistant' && (
                <div className="flex items-center gap-2 mt-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleCopyResult(message.text)}
                    disabled={isCopypasting}
                    aria-label="Copy to clipboard"
                  >
                    {copyStatus === 'copying' ? (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    ) : copyStatus === 'copied' ? (
                      <CheckCircle2 className="h-3 w-3 text-success" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              )}
            </div>
          ))}
          {chatSending && (
            <div className="flex flex-col gap-2 mb-4 mr-auto max-w-[80%]">
              <div className="flex items-start gap-2">
                <MessageCircle className="h-4 w-4 text-muted" />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col gap-1">
                    <div className="h-2 w-4 bg-accent/20 rounded-lg" />
                    <div className="h-2 w-4 bg-accent/20 rounded-lg" />
                    <div className="h-2 w-4 bg-accent/20 rounded-lg" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Chat input */}
        <div className="flex items-center gap-2 pt-4 border-t border-border-subtle">
          <Textarea
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask me about payment operations, ticket analysis, or type your question..."
            rows={2}
            maxRows={4}
            className="flex-1"
            disabled={chatSending}
          />
          <Button
            onClick={handleChatSubmit}
            isLoading={chatSending}
            disabled={chatSending || !chatInput.trim()}
          >
            <MessageCircle className="h-4 w-4" />
            {chatSending ? 'Sending...' : 'Send'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <PageTransition>
    <PageContainer maxWidth="full" className="space-y-4">
      <PageHeader
        title="AI Copilot"
        subtitle="AI-powered assistance for payment operations analysis and classification"
        breadcrumbs={[{ label: 'Home' }, { label: 'AI Copilot' }]}
      />

      {/* Tabs */}
      <Tabs defaultValue="chat" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="analyze">Analyze</TabsTrigger>
          <TabsTrigger value="classify">Classify</TabsTrigger>
          <TabsTrigger value="rca">Root Cause Analysis</TabsTrigger>
          <TabsTrigger value="chat">Chat</TabsTrigger>
        </TabsList>

        <TabsContent value="analyze">
          <div className="space-y-6">
            <div className="border border-border-subtle rounded-lg p-6">
              <h2 className="text-xl font-bold mb-4">Analyze Payment Issues</h2>
              <div className="space-y-4">
                <Label htmlFor="analyzeInput">What would you like me to analyze?</Label>
                <Textarea
                  id="analyzeInput"
                  value={analyzeInput}
                  onChange={(e) => setAnalyzeInput(e.target.value)}
                  rows={6}
                  placeholder="e.g., Analyze the trend of duplicate debit tickets over the past week, or review this payment failure pattern..."
                />
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={handleAnalyze}
                  isLoading={analyzing}
                  disabled={analyzing || !analyzeInput.trim()}
                >
                  <MessageCircle className="mr-2 h-3 w-3" /> Analyze
                </Button>
              </div>
            </div>

            {analyzeResult && (
              <div className="border border-border-subtle rounded-lg p-6">
                <h2 className="text-xl font-bold mb-4">Analysis Result</h2>
                <div className="space-y-4">
                  <div className="whitespace-pre-line text-base">
                    {analyzeResult}
                  </div>
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      onClick={() => handleCopyResult(analyzeResult)}
                      disabled={isCopypasting}
                      aria-label="Copy to clipboard"
                    >
                      {isCopypasting ? (
                        <RefreshCw className="h-3 w-3 animate-spin" />
                      ) : copyStatus === 'copied' ? (
                        <CheckCircle2 className="h-3 w-3 text-success" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      <span className="ml-2 text-sm">{copyStatus === 'copied' ? 'Copied!' : 'Copy'}</span>
                    </Button>
                  </div>
                </div>
              </div>
)}
          </div>
        </TabsContent>

          <TabsContent value="classify">
            <div className="space-y-6">
              <div className="border border-border-subtle rounded-lg p-6">
                <h2 className="text-xl font-bold mb-4">Classify Ticket Description</h2>
                <div className="space-y-4">
                  <Label htmlFor="classifyDescription">Ticket Description</Label>
                  <Textarea
                    id="classifyDescription"
                    value={classifyDescription}
                    onChange={(e) => setClassifyDescription(e.target.value)}
                    rows={5}
                    placeholder="e.g., Customer reports being charged twice for the same transaction on their credit card..."
                  />
                </div>

                <div className="space-y-4">
                  <Label htmlFor="classifyCategories">Classification Categories (JSON - Optional)</Label>
                  <Textarea
                    id="classifyCategories"
                    value={classifyCategories ? JSON.stringify(classifyCategories, null, 2) : ''}
                    onChange={(e) => {
                      try {
                        JSON.parse(e.target.value);
                        setClassifyCategories(e.target.value);
                      } catch (err) {
                        // Invalid JSON, keep previous state
                      }
                    }}
                    rows={4}
                    placeholder='{\n  "Duplicate Debit": ["Double Charge", "Repeated Transaction"],\n  "Settlement Delay": ["Pending Settlement", "Missing Funds"],\n  "Gateway Timeout": ["Connection Timeout", "Response Timeout"]\n}'
                  />
                  <p className="text-caption text-text-muted">
                    Provide categories and sub-types in JSON format for more accurate classification
                  </p>
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={handleClassify}
                    isLoading={classifying}
                    disabled={classifying || !classifyDescription.trim()}
                  >
                    <MessageCircle className="mr-2 h-3 w-3" /> Classify
                  </Button>
                </div>
              </div>

              {classifyResult && (
                <div className="border border-border-subtle rounded-lg p-6">
                  <h2 className="text-xl font-bold mb-4">Classification Result</h2>
                  <div className="space-y-4">
                    <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                      <div>
                        <p className="text-caption text-text-muted"><strong>Category:</strong></p>
                        <p className="font-medium text-text-primary">{classifyResult.category || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-caption text-text-muted"><strong>Issue Type:</strong></p>
                        <p className="font-medium text-text-primary">{classifyResult.issueType || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-caption text-text-muted"><strong>Priority:</strong></p>
                        <p className="font-medium text-text-primary">
                          <Badge
                            variant={
                              classifyResult.priority === 'CRITICAL'
                                ? 'destructive'
                                : classifyResult.priority === 'HIGH'
                                ? 'secondary'
                                : classifyResult.priority === 'MEDIUM'
                                ? 'outline'
                                : 'default'
                            }
                          >
                            {classifyResult.priority || 'N/A'}
                          </Badge>
                        </p>
                      </div>
                      <div>
                        <p className="text-caption text-text-muted"><strong>Recommended Provider:</strong></p>
                        <p className="font-medium text-text-primary">{classifyResult.provider || 'N/A'}</p>
                      </div>
                    </div>

                    <div className="border-t border-border-subtle/50 pt-4">
                      <p className="text-caption text-text-muted"><strong>Reasoning:</strong></p>
                      <p className="whitespace-pre-line text-base">
                        {classifyResult.reasoning || 'No reasoning provided'}
                      </p>
                    </div>

                    <div className="flex justify-end mt-4">
                      <Button
                        variant="outline"
                        onClick={() => handleCopyResult(JSON.stringify(classifyResult, null, 2))}
                        disabled={isCopypasting}
                        aria-label="Copy to clipboard"
                      >
                        {isCopypasting ? (
                          <RefreshCw className="h-3 w-3 animate-spin" />
                        ) : copyStatus === 'copied' ? (
                          <CheckCircle2 className="h-3 w-3 text-success" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                        <span className="ml-2 text-sm">{copyStatus === 'copied' ? 'Copied!' : 'Copy'}</span>
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              </div>
            </TabsContent>

            <TabsContent value="rca">
              <div className="space-y-6">
                <div className="border border-border-subtle rounded-lg p-6">
                  <h2 className="text-xl font-bold mb-4">Generate Root Cause Analysis</h2>
                  <div className="space-y-4">
                    <Label htmlFor="useSample">Use Sample Ticket Data</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleUseSampleData}
                    >
                      <ClipboardList className="mr-2 h-3 w-3" /> Load Sample
                    </Button>
                  </div>

                  <div className="space-y-4">
                    <Label htmlFor="rcaTicketDetails">Ticket Details (JSON)</Label>
                    <Textarea
                      id="rcaTicketDetails"
                      value={rcaTicketDetails}
                      onChange={(e) => setRcaTicketDetails(e.target.value)}
                      rows={8}
                      placeholder='{\n  "id": "TKT-001",\n  "category": "Payment",\n  "issueType": "Duplicate Debit",\n  "partner": "Parkway",\n  "provider": "Adyen",\n  "bu": "Payments",\n  "description": "Customer reported being charged twice for the same transaction on 2026-08-20. The duplicate charge caused an overdraft fee."\n}'
                    />
                    <p className="text-caption text-text-muted">
                      Provide ticket details in JSON format for RCA analysis
                    </p>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      onClick={handleGenerateRCA}
                      isLoading={generatingRCA}
                      disabled={generatingRCA}
                    >
                      <MessageCircle className="mr-2 h-3 w-3" /> Generate RCA
                    </Button>
                  </div>
                </div>

                {rcaResult && (
                  <div className="border border-border-subtle rounded-lg p-6">
                    <h2 className="text-xl font-bold mb-4">Root Cause Analysis Result</h2>
                    <div className="space-y-4">
                      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                        <div>
                          <p className="text-caption text-text-muted"><strong>Root Cause Summary:</strong></p>
                          <p className="whitespace-pre-line text-base">
                            {rcaResult.rootCauseSummary || 'No root cause summary provided'}
                          </p>
                        </div>
                        <div>
                          <p className="text-caption text-text-muted"><strong>Contributing Factors:</strong></p>
                          <p className="whitespace-pre-line text-base">
                            {rcaResult.contributingFactors || 'No contributing factors provided'}
                          </p>
                        </div>
                      </div>
                      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                        <div>
                          <p className="text-caption text-text-muted"><strong>Corrective Actions:</strong></p>
                          <p className="whitespace-pre-line text-base">
                            {rcaResult.correctiveActions || 'No corrective actions provided'}
                          </p>
                        </div>
                        <div>
                          <p className="text-caption text-text-muted"><strong>Preventive Actions:</strong></p>
                          <p className="whitespace-pre-line text-base">
                            {rcaResult.preventiveActions || 'No preventive actions provided'}
                          </p>
                        </div>
                      </div>
                      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                        <div>
                          <p className="text-caption text-text-muted"><strong>Owner of Preventive Actions:</strong></p>
                          <p className="font-medium text-text-primary">{rcaResult.preventiveOwner || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-caption text-text-muted"><strong>Due Date:</strong></p>
                          <p className="font-medium text-text-primary">{rcaResult.preventiveDueDate || 'N/A'}</p>
                        </div>
                      </div>

                      <div className="flex justify-end mt-4">
                        <Button
                          variant="outline"
                          onClick={() => handleCopyResult(JSON.stringify(rcaResult, null, 2))}
                          disabled={isCopypasting}
                          aria-label="Copy to clipboard"
                        >
                          {isCopypasting ? (
                            <RefreshCw className="h-3 w-3 animate-spin" />
                          ) : copyStatus === 'copied' ? (
                            <CheckCircle2 className="h-3 w-3 text-success" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                          <span className="ml-2 text-sm">{copyStatus === 'copied' ? 'Copied!' : 'Copy'}</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
                </div>
              </TabsContent>

              <TabsContent value="chat">
                {/* Chat tab content - moved to top level for better UX */}
                <div className="flex-1 flex flex-col">
                  {/* Header */}
                  <div className="flex flex-col gap-4 mb-4">
                    <h1 className="text-2xl font-bold">AI Copilot Chat</h1>
                    <p className="text-caption text-text-muted">
                      Ask me anything about payment operations, ticket analysis, or get help with investigations
                    </p>
                  </div>

                  {/* Chat messages */}
                  <div className="flex-1 min-h-0 overflow-y-auto" id="chat-container-chat">
                    {chatHistory.map((message, index) => (
                      <div
                        key={index}
                        className={`flex flex-col gap-2 mb-4 ${
                          message.role === 'user' ? 'ml-auto' : 'mr-auto'
                        } max-w-[80%]`}
                      >
                        <div className={`flex items-start gap-2 ${
                          message.role === 'user'
                            ? 'bg-accent/20 rounded-lg p-3'
                            : 'bg-surface-card/50 backdrop-blur-sm rounded-lg p-3'
                        }`}>
                          {message.role === 'user' ? (
                            <MessageCircle className="h-4 w-4 text-accent" />
                          ) : (
                            <MessageCircle className="h-4 w-4 text-muted" />
                          )}
                          <div className="flex-1 min-w-0 whitespace-pre-wrap">
                            {message.text}
                          </div>
                        </div>
                        {message.role === 'assistant' && (
                          <div className="flex items-center gap-2 mt-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleCopyResult(message.text)}
                              disabled={isCopypasting}
                              aria-label="Copy to clipboard"
                            >
                              {copyStatus === 'copying' ? (
                                <RefreshCw className="h-3 w-3 animate-spin" />
                              ) : copyStatus === 'copied' ? (
                                <CheckCircle2 className="h-3 w-3 text-success" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                    {chatSending && (
                      <div className="flex flex-col gap-2 mb-4 mr-auto max-w-[80%]">
                        <div className="flex items-start gap-2">
                          <MessageCircle className="h-4 w-4 text-muted" />
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-col gap-1">
                              <div className="h-2 w-4 bg-accent/20 rounded-lg" />
                              <div className="h-2 w-4 bg-accent/20 rounded-lg" />
                              <div className="h-2 w-4 bg-accent/20 rounded-lg" />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Chat input */}
                  <div className="flex items-center gap-2 pt-4 border-t border-border-subtle">
                    <Textarea
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Ask me about payment operations, ticket analysis, or type your question..."
                      rows={2}
                      maxRows={4}
                      className="flex-1"
                      disabled={chatSending}
                    />
                    <Button
                      onClick={handleChatSubmit}
                      isLoading={chatSending}
                      disabled={chatSending || !chatInput.trim()}
                    >
                      <MessageCircle className="h-4 w-4" />
                      {chatSending ? 'Sending...' : 'Send'}
                    </Button>
                  </div>
                </div>
              </TabsContent>
          </Tabs>
    </PageContainer>
    </PageTransition>
    );
}