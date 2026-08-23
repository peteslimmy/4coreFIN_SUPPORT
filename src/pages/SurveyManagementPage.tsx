import { useState, useEffect, useCallback, type ChangeEvent } from 'react';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  Button,
  Input,
  Badge,
  Separator,
  useToast,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Textarea,
  Label,
  SwitchComponent,
  Skeleton,
  EmptyState,
} from '../components/ui';
import { api } from '../lib/api';
import { formatRelative, parseISO } from '../lib/dateUtils';
import { List, Search, Plus, Trash2, ClipboardList, BarChart3, Settings, ChevronLeft, ChevronRight, Star, Eye } from 'lucide-react';
import PageTransition from '../components/layout/PageTransition';
import PageContainer from '../components/layout/PageContainer';
import PageHeader from '../components/layout/PageHeader';

export default function SurveyManagementPage() {
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [campaignStats, setCampaignStats] = useState<any | null>(null);
  const [surveyResponses, setSurveyResponses] = useState<any[]>([]);
  const [responsePage, setResponsePage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState<Record<string, unknown>>({});
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'campaigns' | 'responses' | 'analytics' | 'settings'>('campaigns');
  const [newCampaignName, setNewCampaignName] = useState('');
  const [newCampaignDescription, setNewCampaignDescription] = useState('');
  const [newCampaignTrigger, setNewCampaignTrigger] = useState('');
  const [isCreatingCampaign, setIsCreatingCampaign] = useState(false);

  const loadCampaigns = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const data = await api.listSurveyCampaigns();
      setCampaigns(data);
    } catch (error: any) {
      toast.error(`Failed to load survey campaigns: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [api, loading, toast]);

  useEffect(() => {
    loadCampaigns();
  }, [filters, search]);

  const loadCampaignStats = useCallback(async (campaignId: string) => {
    try {
      const data = await api.getSurveyCampaignStats(campaignId);
      setCampaignStats(data);
    } catch (error: any) {
      console.error(`Failed to load stats for campaign ${campaignId}:`, error);
    }
  }, [api]);

  const loadSurveyResponses = useCallback(async (campaignId: string, page: number) => {
    try {
      const data = await api.listSurveyResponses(campaignId, page);
      // Assuming the API returns { responses: [...], total_pages: X }
      setSurveyResponses(data.responses || data);
      setTotalPages(data.total_pages || 1);
    } catch (error: any) {
      toast.error(`Failed to load survey responses: ${error.message}`);
    }
  }, [api, toast]);

  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  };

  const handleCreateCampaign = async () => {
    if (!newCampaignName.trim()) {
      toast.error('Please enter a campaign name');
      return;
    }

    setIsCreatingCampaign(true);
    try {
      await api.createSurveyCampaign({
        name: newCampaignName.trim(),
        description: newCampaignDescription.trim() || null,
        trigger_condition: newCampaignTrigger.trim() || null,
        active: true,
      });
      setNewCampaignName('');
      setNewCampaignDescription('');
      setNewCampaignTrigger('');
      loadCampaigns();
      toast.success('Survey campaign created');
    } catch (error: any) {
      toast.error(`Failed to create campaign: ${error.message}`);
    } finally {
      setIsCreatingCampaign(false);
    }
  };

  const handleDeleteCampaign = async (campaignId: string) => {
    if (!window.confirm('Delete this survey campaign and all its responses?')) return;
    try {
      await api.deleteSurveyCampaign(campaignId);
      setSelectedCampaignId(null);
      setCampaignStats(null);
      setSurveyResponses([]);
      loadCampaigns();
      toast.success('Survey campaign deleted');
    } catch (error: any) {
      toast.error(`Failed to delete campaign: ${error.message}`);
    }
  };

  const handleViewCampaign = async (campaignId: string) => {
    setSelectedCampaignId(campaignId);
    setActiveTab('analytics');
    await loadCampaignStats(campaignId);
    loadSurveyResponses(campaignId, 1);
  };

  const handleSubmitSurvey = async (responseData: any) => {
    try {
      await api.submitSurveyResponse(responseData);
      toast.success('Thank you for your feedback!');
    } catch (error: any) {
      toast.error(`Failed to submit survey response: ${error.message}`);
    }
  };

  const handlePreviousPage = () => {
    if (responsePage > 1 && selectedCampaignId) {
      setResponsePage(prev => prev - 1);
      loadSurveyResponses(selectedCampaignId, responsePage - 1);
    }
  };

  const handleNextPage = () => {
    if (responsePage < totalPages && selectedCampaignId) {
      setResponsePage(prev => prev + 1);
      loadSurveyResponses(selectedCampaignId, responsePage + 1);
    }
  };

  if (loading && campaigns.length === 0) {
    return (
      <PageTransition>
      <PageContainer maxWidth="full" className="space-y-4">
        <PageHeader
          title="Survey & CSAT Management"
          subtitle="Create, manage, and analyze customer satisfaction surveys"
          breadcrumbs={[{ label: 'Home' }, { label: 'Surveys' }]}
        />
        <Skeleton variant="card" count={3} />
      </PageContainer>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
    <PageContainer maxWidth="full" className="space-y-4">
      <PageHeader
        title="Survey & CSAT Management"
        subtitle="Create, manage, and analyze customer satisfaction surveys"
        breadcrumbs={[{ label: 'Home' }, { label: 'Surveys' }]}
        actions={<>
          <Button variant="outline" onClick={() => setActiveTab('settings')}>
            <Settings className="mr-2 h-3 w-3" /> Settings
          </Button>
          <Button onClick={handleCreateCampaign} isLoading={isCreatingCampaign}>
            <Plus className="mr-2 h-3 w-3" /> New Campaign
          </Button>
        </>}
      />

      {/* Search bar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="text-sm font-medium text-text-muted">Search campaigns</label>
        <div className="flex-1 min-w-0 relative">
          <Input
            placeholder="Search by campaign name or description..."
            value={search}
            onChange={handleSearchChange}
            className="pr-10"
          />
          <Search className="absolute inset-y-0 right-3 flex h-4 w-4 items-center justify-center text-text-muted pointer-events-none" />
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="campaigns" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="responses">Responses</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns">
          <div className="flex-1 flex flex-col">
            {campaigns.length === 0 ? (
              <EmptyState
                icon={<ClipboardList className="w-16 h-16" />}
                title="No survey campaigns found"
                action={{ label: 'Create First Campaign', onClick: () => setActiveTab('settings') }}
              />
            ) : (
              <div className="flex-1 flex flex-col">
                {/* Campaigns table header */}
                <div className="flex items-center justify-between px-4 py-2 bg-surface-hover/50 rounded-t-lg border-b border-border-subtle">
                  <div className="flex items-center gap-2">
                    <span className="text-caption font-medium">
                      {campaigns.length} campaign{campaigns.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="text-caption text-text-muted">
                    Showing all campaigns
                  </div>
                </div>

                {/* Campaigns table */}
                <Table className="w-full">
                  <TableHeader className="border-b border-border">
                    <TableRow className="hover:bg-surface-hover">
                      <TableCell className="w-4 px-2 text-center" />
                      <TableCell className="w-20">Campaign Name</TableCell>
                      <TableCell className="w-20">Description</TableCell>
                      <TableCell className="w-16">Trigger Condition</TableCell>
                      <TableCell className="w-12">Status</TableCell>
                      <TableCell className="w-12">Responses</TableCell>
                      <TableCell className="w-12">Actions</TableCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaigns.map((campaign) => {
                      const isSelected = selectedCampaignId === campaign.id;
                      return (
                        <TableRow
                          key={campaign.id}
                          className={`
                            hover:bg-surface-hover
                            ${isSelected ? 'bg-accent/10' : ''}
                          `}
                          onClick={() => handleViewCampaign(campaign.id)}
                        >
                          <TableCell className="px-2 text-center" />
                          <TableCell className="flex-1 min-w-0 truncate">
                            <p className="font-medium">{campaign.name}</p>
                          </TableCell>
                          <TableCell className="flex-1 min-w-0 truncate">
                            {campaign.description || '<em>No description</em>'}
                          </TableCell>
                          <TableCell className="flex-1 min-w-0 truncate">
                            {campaign.trigger_condition || '<em>Manual trigger</em>'}
                          </TableCell>
                          <TableCell className="text-center text-caption">
                            <Badge
                              variant={campaign.active ? 'secondary' : 'outline'}
                            >
                              {campaign.active ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center text-caption">
                            {campaign.response_count || 0}
                          </TableCell>
                          <TableCell className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleViewCampaign(campaign.id);
                              }}
                              aria-label="View campaign analytics"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteCampaign(campaign.id);
                              }}
                              aria-label="Delete campaign"
                            >
                              <Trash2 className="h-4 w-4 text-error" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
)}
           </div>
         </TabsContent>

          <TabsContent value="responses">
            <div className="flex-1 flex flex-col">
              {!selectedCampaignId ? (
                <EmptyState
                  icon={<ClipboardList className="w-16 h-16" />}
                  title="Select a campaign to view responses"
                />
              ) : (
                <div className="flex-1 flex flex-col gap-4">
                  <div className="flex flex-col gap-4">
                    <div className="flex justify-between items-start">
                      <h2 className="text-xl font-bold">
                        {campaigns.find((c) => c.id === selectedCampaignId)?.name || 'Survey Responses'}
                      </h2>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          onClick={handlePreviousPage}
                          disabled={responsePage <= 1}
                        >
                          <ChevronLeft className="h-3 w-3" /> Previous
                        </Button>
                        <span className="text-caption text-text-muted">
                          Page {responsePage} of {totalPages}
                        </span>
                        <Button
                          variant="outline"
                          onClick={handleNextPage}
                          disabled={responsePage >= totalPages}
                        >
                          Next <ChevronRight className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    {surveyResponses.length === 0 ? (
                      <EmptyState
                        icon={<ClipboardList className="w-12 h-12" />}
                        title="No survey responses found"
                        message={responsePage > 1 ? 'Try viewing a different page' : undefined}
                      />
                    ) : (
                      <div className="space-y-4">
                        {surveyResponses.map((response, index) => (
                          <div
                            key={response.id || index}
                            className="border border-border-subtle rounded-lg p-4"
                          >
                            <div className="flex justify-between items-start mb-2">
                              <p className="font-medium text-text-primary">
                                Response #{response.id || index + 1}
                              </p>
                              <p className="text-caption text-text-muted">
                                Submitted: {formatRelative(
                                  parseISO(response.submitted_at || response.created_at),
                                  new Date()
                                )}
                              </p>
                            </div>
                            <div className="space-y-3">
                              {Object.keys(response).map((key) => {
                                if (key !== 'id' && key !== 'submitted_at' && key !== 'created_at' && key !== 'campaign_id') {
                                  return (
                                    <div key={key} className="border-t border-border-subtle/50 pt-3">
                                      <p className="flex justify-between text-sm">
                                        <span className="font-medium">{key.replace(/_/g, ' ')}:</span>
                                        <span className="text-text-muted">{response[key]}</span>
                                      </p>
                                    </div>
                                  );
                                }
                                return null;
                              }).filter(Boolean)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="analytics">
            <div className="flex-1 flex flex-col">
              {!selectedCampaignId ? (
                <EmptyState
                  icon={<BarChart3 className="w-16 h-16" />}
                  title="Select a campaign to view analytics"
                />
              ) : (
                <div className="flex-1 flex flex-col gap-4">
                  {!campaignStats ? (
                    <div className="flex-1 flex flex-col items-center justify-center py-8">
                      <Skeleton variant="chart" />
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="border border-border-subtle rounded-lg p-6">
                        <h2 className="text-xl font-bold mb-4">Campaign Overview</h2>
                        <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                          <div className="border border-border-subtle rounded-lg p-4">
                            <p className="text-caption text-text-muted">Total Responses</p>
                            <p className="text-2xl font-bold text-accent">
                              {campaignStats.total_responses || 0}
                            </p>
                          </div>
                          <div className="border border-border-subtle rounded-lg p-4">
                            <p className="text-caption text-text-muted">Completion Rate</p>
                            <p className="text-2xl font-bold text-accent">
                              {((campaignStats.completed_responses || 0) / Math.max(campaignStats.total_responses || 1, 1) * 100).toFixed(1)}%
                            </p>
                          </div>
                          <div className="border border-border-subtle rounded-lg p-4">
                            <p className="text-caption text-text-muted">Average Satisfaction</p>
                            <p className="text-2xl font-bold text-accent">
                              {(campaignStats.average_satisfaction || 0).toFixed(1)} / 5.0
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Satisfaction breakdown */}
                      {campaignStats.satisfaction_breakdown && (
                        <div className="border border-border-subtle rounded-lg p-6">
                          <h2 className="text-xl font-bold mb-4">Satisfaction Breakdown</h2>
                          <div className="space-y-4">
                            {['1', '2', '3', '4', '5'].map((rating) => {
                              const count = campaignStats.satisfaction_breakdown?.[rating] || 0;
                              const percentage = campaignStats.total_responses > 0 ? (count / campaignStats.total_responses) * 100 : 0;
                              return (
                                <div key={rating} className="flex items-center justify-between py-2">
                                  <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-2">
                                      {[...Array(Number(rating))].map((_, index) => (
                                        <Star key={index} className="h-3 w-3 text-warning" />
                                      ))}
                                    </div>
                                    <span className="text-sm font-medium">
                                      {rating} Star{Number(rating) !== 1 && 's'}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className="text-caption font-medium">{count}</span>
                                    <span className="text-caption text-text-muted">({percentage.toFixed(1)}%)</span>
                                    <div className="w-24 bg-border-subtle rounded-full h-2.5 overflow-hidden">
                                      <div
                                        className="bg-success h-full transition-width duration-500" style={{ width: `${percentage}%` }}
                                      ></div>
                                    </div>
                                  </div>
                                </div>
                              )})}
                            </div>
                          </div>
                      )}

                      {/* Response trends */}
                      {campaignStats.response_trends && (
                        <div className="border border-border-subtle rounded-lg p-6">
                          <h2 className="text-xl font-bold mb-4">Response Trends (Last 30 Days)</h2>
                          <div className="space-y-4">
                            {campaignStats.response_trends.map((day: any, index: number) => (
                              <div key={index} className="border-t border-border-subtle/50 pt-4">
                                <p className="flex justify-between text-sm">
                                  <span className="text-caption">{day.date}</span>
                                  <span className="text-caption font-medium">{day.count} responses</span>
                                </p>
                                <div className="w-full bg-border-subtle rounded-full h-4 mt-1 overflow-hidden">
                                  <div
                                    className="bg-accent h-full transition-width duration-500" style={{ width: `${Math.min(day.count * 10, 100)}%` }}
                                  ></div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="settings">
            <div className="flex-1 flex flex-col gap-6 p-4">
              <div className="border border-border-subtle rounded-lg p-6">
                <h2 className="text-xl font-bold mb-4">Survey Settings</h2>
                <div className="space-y-4">
                  <p className="font-medium text-text-medium">Default Survey Template</p>
                  <div className="space-y-3">
                    <Textarea
                      rows={4}
                      placeholder="Default survey questions for new campaigns..."
                      className="w-full"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="font-medium text-text-medium">Auto-trigger Rules</p>
                  <div className="space-y-3">
                    <Button variant="outline" onClick={() => {
                      // In a real app, this would open a modal for creating trigger rules
                      toast.info('Trigger rule builder coming soon');
                    }}>
                      <Plus className="mr-2 h-3 w-3" /> Create Auto-trigger Rule
                    </Button>
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="font-medium text-text-medium">Integration Settings</p>
                  <div className="space-y-3">
                    <SwitchComponent
                      id="emailNotifications"
                      defaultChecked
                    />
                    <Label htmlFor="emailNotifications">
                      Send survey requests via email
                    </Label>
                  </div>
                  <div className="space-y-3">
                    <SwitchComponent
                      id="inAppNotifications"
                      defaultChecked
                    />
                    <Label htmlFor="inAppNotifications">
                      Show survey requests in-app
                    </Label>
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="font-medium text-text-medium">Survey Statistics</p>
                  <div className="border border-border-subtle rounded-lg p-4">
                    <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                      <div>
                        <p className="text-caption text-text-muted">
                          <strong>Total Campaigns:</strong> {campaigns.length}
                        </p>
                        <p className="text-caption text-text-muted">
                          <strong>Active Campaigns:</strong> {campaigns.filter((c) => c.active).length}
                        </p>
                        <p className="text-caption text-text-muted">
                          <strong>Total Responses:</strong> {campaigns.reduce((sum, c) => sum + (c.response_count || 0), 0)}
                        </p>
                      </div>
                      <div>
                        <Button variant="outline" onClick={() => {
                          // In a real app, this would trigger a report generation
                          toast.info('Generating survey report...');
                        }}>
                          <BarChart3 className="mr-2 h-3 w-3" /> Generate Report
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </PageContainer>
      </PageTransition>
  );
}