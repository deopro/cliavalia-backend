import { useEffect, useState, useCallback } from 'react';
import {
  Page,
  Layouts,
  useFetchClient,
  useNotification,
} from '@strapi/strapi/admin';
import {
  Box,
  Flex,
  Typography,
  Grid,
  Button,
  Tabs,
  Field,
  Toggle,
  TextInput,
  NumberInput,
  Divider,
  Badge,
  Loader,
} from '@strapi/design-system';
import { Check } from '@strapi/icons';

// ── Setting keys grouped by category ──────────────────────────────

const AUTH_KEYS = [
  { key: 'guestLimitEnabled', label: 'Guest Rate Limit' },
  { key: 'googleAuthEnabled', label: 'Google Login' },
  { key: 'facebookAuthEnabled', label: 'Facebook Login' },
  { key: 'emailAuthEnabled', label: 'Email/Password Login' },
  { key: 'businessEmailAuthEnabled', label: 'Business Email Login' },
] as const;

const PRICING_KEYS = [
  { key: 'proPriceKz', label: 'Pro Price (Kz)', type: 'number' as const },
  { key: 'enterprisePriceKz', label: 'Enterprise Price (Kz)', type: 'number' as const },
] as const;

const BANK_KEYS = [
  { key: 'bankName', label: 'Bank Name' },
  { key: 'bankAccountName', label: 'Account Name' },
  { key: 'bankIBAN', label: 'IBAN' },
  { key: 'bankAccountNumber', label: 'Account Number' },
] as const;

const FEATURE_NAMES = [
  { suffix: 'viewReviews', label: 'View Reviews' },
  { suffix: 'manageProfile', label: 'Manage Profile' },
  { suffix: 'replyToReviews', label: 'Reply to Reviews' },
  { suffix: 'dashboard', label: 'Dashboard' },
  { suffix: 'analytics', label: 'Analytics' },
  { suffix: 'alerts', label: 'Alerts' },
  { suffix: 'multiLocation', label: 'Multi-Location' },
  { suffix: 'locationComparison', label: 'Location Comparison' },
  { suffix: 'consolidatedDashboard', label: 'Consolidated Dashboard' },
  { suffix: 'advancedReports', label: 'Advanced Reports' },
  { suffix: 'dedicatedSupport', label: 'Dedicated Support' },
  { suffix: 'guaranteedSLA', label: 'Guaranteed SLA' },
  { suffix: 'assistedOnboarding', label: 'Assisted Onboarding' },
] as const;

const PLAN_TIERS = [
  { prefix: 'planFree', label: 'Free', color: 'neutral' },
  { prefix: 'planPro', label: 'Pro', color: 'warning' },
  { prefix: 'planEnterprise', label: 'Enterprise', color: 'secondary' },
] as const;

// ── Main component ────────────────────────────────────────────────

const Settings = () => {
  const [settings, setSettings] = useState<Record<string, any> | null>(null);
  const [dirty, setDirty] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const { get, put } = useFetchClient();
  const { toggleNotification } = useNotification();

  const fetchSettings = useCallback(async () => {
    try {
      const { data } = await get('/site-settings/settings');
      setSettings(data);
      setDirty({});
    } catch {
      toggleNotification({
        type: 'danger',
        message: 'Failed to load settings',
      });
    } finally {
      setLoading(false);
    }
  }, [get, toggleNotification]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const merged = { ...settings, ...dirty };

  const update = (key: string, value: any) => {
    setDirty((prev: Record<string, any>) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (Object.keys(dirty).length === 0) return;
    setSaving(true);
    try {
      const { data } = await put('/site-settings/settings', dirty);
      setSettings(data);
      setDirty({});
      toggleNotification({
        type: 'success',
        message: 'Settings saved',
      });
    } catch {
      toggleNotification({
        type: 'danger',
        message: 'Failed to save settings',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Page.Main>
        <Layouts.Header title="Site Settings" />
        <Layouts.Content>
          <Flex justifyContent="center" paddingTop={8}>
            <Loader>Loading settings…</Loader>
          </Flex>
        </Layouts.Content>
      </Page.Main>
    );
  }

  if (!settings) {
    return (
      <Page.Main>
        <Layouts.Header title="Site Settings" />
        <Layouts.Content>
          <Box padding={8}>
            <Typography variant="beta" textColor="danger600">
              Failed to load settings. Please refresh.
            </Typography>
          </Box>
        </Layouts.Content>
      </Page.Main>
    );
  }

  const hasDirty = Object.keys(dirty).length > 0;

  return (
    <Page.Main>
      <Layouts.Header
        title="Site Settings"
        subtitle="Manage authentication, pricing, bank details, and plan features"
        primaryAction={
          <Button
            onClick={handleSave}
            loading={saving}
            disabled={!hasDirty}
            startIcon={<Check />}
          >
            Save
          </Button>
        }
      />
      <Layouts.Content>
        <Box padding={6} background="neutral0" shadow="filterShadow" hasRadius>
          <Tabs.Root defaultValue="general">
            <Tabs.List>
              <Tabs.Trigger value="general">General</Tabs.Trigger>
              <Tabs.Trigger value="pricing">Pricing &amp; Bank</Tabs.Trigger>
              <Tabs.Trigger value="plans">Plan Features</Tabs.Trigger>
            </Tabs.List>

            {/* ── General tab ──────────────────────────── */}
            <Tabs.Content value="general">
              <Box paddingTop={6}>
                <Typography variant="delta" tag="h2">
                  Authentication &amp; Access
                </Typography>
                <Box paddingTop={4}>
                  <Flex direction="column" gap={4}>
                    {AUTH_KEYS.map(({ key, label }) => (
                      <Flex key={key} justifyContent="space-between" alignItems="center">
                        <Typography>{label}</Typography>
                        <Toggle
                          checked={merged[key]}
                          onChange={(e: { target: { checked: boolean } }) =>
                            update(key, e.target.checked)
                          }
                          onLabel="Enabled"
                          offLabel="Disabled"
                        />
                      </Flex>
                    ))}
                  </Flex>
                </Box>
              </Box>
            </Tabs.Content>

            {/* ── Pricing & Bank tab ───────────────────── */}
            <Tabs.Content value="pricing">
              <Box paddingTop={6}>
                <Typography variant="delta" tag="h2">
                  Pricing
                </Typography>
                <Box paddingTop={4}>
                  <Grid.Root gap={4}>
                    {PRICING_KEYS.map(({ key, label }) => (
                      <Grid.Item key={key} col={6} s={12}>
                        <Field.Root>
                          <Field.Label>{label}</Field.Label>
                          <NumberInput
                            value={merged[key]}
                            onValueChange={(val: number | undefined) => update(key, val ?? 0)}
                          />
                        </Field.Root>
                      </Grid.Item>
                    ))}
                  </Grid.Root>
                </Box>

                <Box paddingTop={6}>
                  <Divider />
                </Box>

                <Box paddingTop={6}>
                  <Typography variant="delta" tag="h2">
                    Bank Details
                  </Typography>
                  <Box paddingTop={4}>
                    <Grid.Root gap={4}>
                      {BANK_KEYS.map(({ key, label }) => (
                        <Grid.Item key={key} col={6} s={12}>
                          <Field.Root>
                            <Field.Label>{label}</Field.Label>
                            <TextInput
                              value={merged[key] ?? ''}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                update(key, e.target.value)
                              }
                            />
                          </Field.Root>
                        </Grid.Item>
                      ))}
                    </Grid.Root>
                  </Box>
                </Box>
              </Box>
            </Tabs.Content>

            {/* ── Plan Features tab ────────────────────── */}
            <Tabs.Content value="plans">
              <Box paddingTop={6}>
                <Typography variant="delta" tag="h2">
                  Feature Matrix
                </Typography>
                <Box paddingTop={2}>
                  <Typography variant="pi" textColor="neutral600">
                    Toggle which features are available on each plan tier.
                  </Typography>
                </Box>

                {/* Header row */}
                <Box paddingTop={4}>
                  <Grid.Root gap={2}>
                    <Grid.Item col={4}>
                      <Typography fontWeight="bold">Feature</Typography>
                    </Grid.Item>
                    {PLAN_TIERS.map(({ prefix, label }) => (
                      <Grid.Item key={prefix} col={2}>
                        <Flex justifyContent="center">
                          <Badge>{label}</Badge>
                        </Flex>
                      </Grid.Item>
                    ))}
                  </Grid.Root>
                </Box>

                <Box paddingTop={2}>
                  <Divider />
                </Box>

                {/* Feature rows */}
                <Box paddingTop={2}>
                  <Flex direction="column" gap={3}>
                    {FEATURE_NAMES.map(({ suffix, label }) => (
                      <Grid.Root key={suffix} gap={2}>
                        <Grid.Item col={4}>
                          <Flex alignItems="center" height="100%">
                            <Typography>{label}</Typography>
                          </Flex>
                        </Grid.Item>
                        {PLAN_TIERS.map(({ prefix }) => {
                          const storeKey = `${prefix}_${suffix}`;
                          return (
                            <Grid.Item key={storeKey} col={2}>
                              <Flex justifyContent="center">
                                <Toggle
                                  checked={merged[storeKey]}
                                  onChange={(e: { target: { checked: boolean } }) =>
                                    update(storeKey, e.target.checked)
                                  }
                                  onLabel=""
                                  offLabel=""
                                />
                              </Flex>
                            </Grid.Item>
                          );
                        })}
                      </Grid.Root>
                    ))}
                  </Flex>
                </Box>
              </Box>
            </Tabs.Content>
          </Tabs.Root>
        </Box>
      </Layouts.Content>
    </Page.Main>
  );
};

export default Settings;