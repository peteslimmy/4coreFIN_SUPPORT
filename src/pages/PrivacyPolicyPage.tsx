import { useState } from 'react';
import { Shield, FileText, Lock, Eye } from 'lucide-react';
import AuthLogo from '../components/auth/AuthLogo';
import PageTransition from '../components/layout/PageTransition';

export default function PrivacyPolicyPage() {
  const [activeTab, setActiveTab] = useState<'privacy' | 'terms'>('privacy');

  return (
    <PageTransition>
      <div className="min-h-screen bg-app py-12 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <AuthLogo />
            <h1 className="text-3xl font-bold text-text-primary mt-4">Legal Information</h1>
            <p className="text-text-muted mt-2">Last updated: August 6, 2025</p>
          </div>

          <div className="bg-surface-card border border-border-subtle rounded-xl shadow-card overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-border">
              <button
                onClick={() => setActiveTab('privacy')}
                className={`flex-1 py-4 px-6 text-center font-medium transition ${
                  activeTab === 'privacy'
                    ? 'text-accent border-b-2 border-accent bg-accent/5'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <Shield className="inline-block w-5 h-5 mr-2" />
                Privacy Policy
              </button>
              <button
                onClick={() => setActiveTab('terms')}
                className={`flex-1 py-4 px-6 text-center font-medium transition ${
                  activeTab === 'terms'
                    ? 'text-accent border-b-2 border-accent bg-accent/5'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <FileText className="inline-block w-5 h-5 mr-2" />
                Terms of Service
              </button>
            </div>

            {/* Content */}
            <div className="p-8 prose prose-sm max-w-none">
              {activeTab === 'privacy' ? (
                <div className="space-y-6 text-text-secondary">
                  <section>
                    <h2 className="text-xl font-bold text-text-primary mb-3">1. Introduction</h2>
                    <p>4CoreFinSupport ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our payment operations support platform.</p>
                  </section>

                  <section>
                    <h2 className="text-xl font-bold text-text-primary mb-3">2. Information We Collect</h2>
                    <p>We collect information you provide directly to us, including:</p>
                    <ul className="list-disc pl-6 space-y-1">
                      <li>Account information (name, email, phone number, business unit)</li>
                      <li>Ticket data (transaction details, customer information, descriptions)</li>
                      <li>Payment information (transaction IDs, amounts, card details - masked)</li>
                      <li>Communication data (comments, messages, attachments)</li>
                      <li>Usage data (login times, IP addresses, browser type)</li>
                    </ul>
                  </section>

                  <section>
                    <h2 className="text-xl font-bold text-text-primary mb-3">3. How We Use Your Information</h2>
                    <p>We use the collected information for:</p>
                    <ul className="list-disc pl-6 space-y-1">
                      <li>Providing and maintaining our services</li>
                      <li>Processing ticket submissions and investigations</li>
                      <li>Communicating with you about your account and tickets</li>
                      <li>Improving our platform and user experience</li>
                      <li>Complying with legal and regulatory obligations</li>
                      <li>Preventing fraud and ensuring security</li>
                    </ul>
                  </section>

                  <section>
                    <h2 className="text-xl font-bold text-text-primary mb-3">4. Data Protection</h2>
                    <div className="bg-success/10 border border-success/20 rounded-lg p-4">
                      <p className="text-success font-medium mb-2">🔒 Your data is protected by:</p>
                      <ul className="list-disc pl-6 space-y-1">
                        <li>End-to-end encryption for sensitive data</li>
                        <li>Masking of PII in client-side storage</li>
                        <li>Immutable audit logs for compliance</li>
                        <li>Role-based access control (RBAC)</li>
                        <li>Regular security assessments</li>
                      </ul>
                    </div>
                  </section>

                  <section>
                    <h2 className="text-xl font-bold text-text-primary mb-3">5. Data Retention</h2>
                    <p>We retain your information for as long as necessary to provide our services and comply with legal obligations:</p>
                    <ul className="list-disc pl-6 space-y-1">
                      <li>Audit logs: 7 years (compliance requirement)</li>
                      <li>Active tickets: Indefinitely until resolution</li>
                      <li>Soft-deleted tickets: 2 years</li>
                      <li>Comments: 7 years</li>
                      <li>Evidence files: 7 years</li>
                    </ul>
                  </section>

                  <section>
                    <h2 className="text-xl font-bold text-text-primary mb-3">6. Your Rights</h2>
                    <p>You have the right to:</p>
                    <ul className="list-disc pl-6 space-y-1">
                      <li>Access your personal data</li>
                      <li>Request correction of inaccurate data</li>
                      <li>Request deletion of your data (subject to legal retention requirements)</li>
                      <li>Object to processing of your data</li>
                      <li>Data portability</li>
                    </ul>
                  </section>

                  <section>
                    <h2 className="text-xl font-bold text-text-primary mb-3">7. Contact Us</h2>
                    <p>For privacy-related inquiries, contact us at:</p>
                    <p className="font-medium">privacy@4core.com</p>
                  </section>
                </div>
              ) : (
                <div className="space-y-6 text-text-secondary">
                  <section>
                    <h2 className="text-xl font-bold text-text-primary mb-3">1. Acceptance of Terms</h2>
                    <p>By accessing or using 4CoreFinSupport, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our platform.</p>
                  </section>

                  <section>
                    <h2 className="text-xl font-bold text-text-primary mb-3">2. Description of Service</h2>
                    <p>4CoreFinSupport provides a payment operations support platform for managing incident tickets, evidence, customer communications, and compliance reporting for financial institutions and payment partners.</p>
                  </section>

                  <section>
                    <h2 className="text-xl font-bold text-text-primary mb-3">3. User Responsibilities</h2>
                    <p>You agree to:</p>
                    <ul className="list-disc pl-6 space-y-1">
                      <li>Provide accurate and truthful information</li>
                      <li>Maintain the security of your account credentials</li>
                      <li>Comply with all applicable laws and regulations</li>
                      <li>Not misuse or attempt to breach our security measures</li>
                      <li>Report any security vulnerabilities immediately</li>
                    </ul>
                  </section>

                  <section>
                    <h2 className="text-xl font-bold text-text-primary mb-3">4. Prohibited Activities</h2>
                    <p>You may not:</p>
                    <ul className="list-disc pl-6 space-y-1">
                      <li>Access unauthorized areas of the platform</li>
                      <li>Interfere with or disrupt the platform's functionality</li>
                      <li>Use the platform for illegal activities</li>
                      <li>Share false or misleading information in tickets</li>
                      <li>Attempt to escalate privileges beyond your assigned role</li>
                    </ul>
                  </section>

                  <section>
                    <h2 className="text-xl font-bold text-text-primary mb-3">5. Intellectual Property</h2>
                    <p>All content, features, and functionality of 4CoreFinSupport are owned by 4CoreFinSupport and protected by international copyright, trademark, and other intellectual property laws.</p>
                  </section>

                  <section>
                    <h2 className="text-xl font-bold text-text-primary mb-3">6. Limitation of Liability</h2>
                    <p>4CoreFinSupport shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use or inability to use the platform.</p>
                  </section>

                  <section>
                    <h2 className="text-xl font-bold text-text-primary mb-3">7. Changes to Terms</h2>
                    <p>We reserve the right to modify these terms at any time. We will notify users of any material changes via email or platform notification.</p>
                  </section>

                  <section>
                    <h2 className="text-xl font-bold text-text-primary mb-3">8. Contact Information</h2>
                    <p>For questions about these terms, contact us at:</p>
                    <p className="font-medium">legal@4core.com</p>
                  </section>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}