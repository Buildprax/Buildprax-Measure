// BUILDPRAX MEASURE PRO - Website JavaScript
// If you later add Functions to App Platform at /api/send-email,
// you can switch this to '/api/send-email'.
const EMAIL_ENDPOINT = 'https://faas-syd1-c274eac6.doserverless.co/api/v1/web/fn-2ec741fb-b50c-4391-994a-0fd583e5fd49/default/send-email';
/** Direct DigitalOcean auth function (desktop apps, local file preview, non-production hosts). */
const AUTH_API_DIRECT = 'https://faas-syd1-c274eac6.doserverless.co/api/v1/web/fn-2ec741fb-b50c-4391-994a-0fd583e5fd49/default/auth-api';

/** Same-origin proxy on live site removes cross-origin CORS/SW issues for browser sign-in. */
function getAuthApiBase() {
    if (typeof window === 'undefined') return AUTH_API_DIRECT;
    try {
        const h = String(window.location.hostname || '').toLowerCase();
        if (h === 'buildprax.com' || h === 'www.buildprax.com') {
            return 'https://buildprax.com/api/auth';
        }
    } catch (_) {
        /* ignore */
    }
    return AUTH_API_DIRECT;
}

function detectPlatformFromBrowser() {
    const userAgent = navigator.userAgent || '';
    const platform = navigator.platform || '';
    const combined = `${platform} ${userAgent}`.toLowerCase();
    if (combined.includes('windows')) {
        return 'Windows';
    }
    if (combined.includes('mac')) {
        return 'macOS';
    }
    return '';
}

document.addEventListener('DOMContentLoaded', function() {
    // Smooth scrolling for navigation links
    const navLinks = document.querySelectorAll('.nav a[href^="#"]');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const targetSection = document.querySelector(targetId);
            if (targetSection) {
                targetSection.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Add scroll effect to header
    let lastScrollTop = 0;
    const header = document.querySelector('.header');
    window.addEventListener('scroll', function() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        if (scrollTop > lastScrollTop && scrollTop > 100) {
            // Scrolling down
            header.style.transform = 'translateY(-100%)';
        } else {
            // Scrolling up
            header.style.transform = 'translateY(0)';
        }
        lastScrollTop = scrollTop;
    });

    // Add intersection observer for animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    // Observe feature cards and other elements
    const animatedElements = document.querySelectorAll('.feature-card, .download-card, .pricing-card, .support-card');
    animatedElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });

    initializeMembersArea();
});

// Registration Modal Functions
function showRegistrationModal() {
    const modal = document.getElementById('registrationModal');
    if (modal) {
        // Get selected platform to show appropriate message
        const selectedPlatform = localStorage.getItem('selectedPlatform');
        const isWindows = selectedPlatform === 'windows';
        
        // Update modal title/message/button based on platform
        const modalTitle = modal.querySelector('h2');
        const modalDescription = modal.querySelector('p');
        const submitButton = modal.querySelector('button[type="submit"]');
        if (modalTitle && modalDescription) {
            if (isWindows) {
                modalTitle.textContent = 'Download BUILDPRAX MEASURE PRO for Windows';
                modalDescription.textContent = 'Complete the form below to get your download link. You\'ll be redirected to the Microsoft Store after submission.';
                if (submitButton) submitButton.textContent = 'Open Microsoft Store';
            } else {
                modalTitle.textContent = 'Download BUILDPRAX MEASURE PRO for macOS';
                modalDescription.textContent = 'Complete the form below to start your 14-day free trial. You\'ll receive the download link immediately.';
                if (submitButton) submitButton.textContent = 'Start Download';
            }
        }
        
        // Update platform field in form
        const platformField = document.getElementById('platform');
        if (platformField) {
            if (isWindows) {
                platformField.value = 'Windows';
            } else if (selectedPlatform === 'mac') {
                platformField.value = 'macOS';
            } else {
                platformField.value = selectedPlatform ? selectedPlatform.charAt(0).toUpperCase() + selectedPlatform.slice(1) : '';
            }
        }
        
        // Reset form (but preserve platform field)
        const form = document.getElementById('registrationForm');
        if (form) {
            const platformValue = platformField ? platformField.value : '';
            form.reset();
            // Restore platform value after reset
            if (platformField && platformValue) {
                platformField.value = platformValue;
            }
        }
        
        // Show modal
        modal.style.display = 'block';
    }
}

function closeRegistrationModal() {
    document.getElementById('registrationModal').style.display = 'none';
}

const PACKAGE_PRICES = {
    quartz: { monthly: 10, quarterly: 30, halfyearly: 55, yearly: 100, yearlyAdditional: 90 },
    emerald: { monthly: 18, quarterly: 54, halfyearly: 99, yearly: 180, yearlyAdditional: 162 },
    sapphire: { monthly: 21, quarterly: 63, halfyearly: 115, yearly: 210, yearlyAdditional: 189 },
    diamond: { monthly: 29, quarterly: 87, halfyearly: 159, yearly: 290, yearlyAdditional: 261 },
};

const PACKAGE_LABELS = {
    quartz: 'Quartz',
    emerald: 'Emerald',
    sapphire: 'Sapphire',
    diamond: 'Diamond',
};

// Live plan IDs (BuildPrax packages x cycles)
const PLAN_IDS = {
    quartz: {
        monthly: 'P-3J073398P3559135BNHJ45UI',
        quarterly: 'P-30K921908L429603BNHJ5ACY',
        halfyearly: 'P-94J443381C949051BNHJ5BMQ',
        yearly: 'P-4MN478353Y062360ANHJ5DBQ',
    },
    emerald: {
        monthly: 'P-1S501420WG286542LNHJ5G3A',
        quarterly: 'P-926425524K585832GNHJ5HUI',
        halfyearly: 'P-8HH73921XA896824NNHJ5I2Y',
        yearly: 'P-3R8372600K076935FNHJ5KNA',
    },
    sapphire: {
        monthly: 'P-8H696013XT563322HNHJ5MTI',
        quarterly: 'P-8RR61939JV344163BNHJ5O2A',
        halfyearly: 'P-62437076NY240873UNHJ5REY',
        yearly: 'P-1RB20550BH271030CNHJ5TEQ',
    },
    diamond: {
        monthly: 'P-14M01620TM4779401NHJ5UXY',
        quarterly: 'P-7MN435228A979822VNHJ5VRQ',
        halfyearly: 'P-45K182315A961464XNHJ5WMY',
        yearly: 'P-93K3717766896443TNHJ5XPY',
    },
};

let selectedPackageCode = 'quartz';

function normalizeCycleKey(v) {
    if (!v) return 'monthly';
    if (v === 'half-yearly' || v === 'half_yearly') return 'halfyearly';
    return v;
}

function updatePlanOptionLabels(packageCode) {
    const code = PACKAGE_PRICES[packageCode] ? packageCode : 'quartz';
    const prices = PACKAGE_PRICES[code];
    const label = PACKAGE_LABELS[code] || 'Quartz';
    const selectedPackageEl = document.getElementById('bp-selected-package');
    if (selectedPackageEl) selectedPackageEl.textContent = `Selected package: ${label}`;
    const monthlyEl = document.getElementById('bp-price-monthly');
    const quarterlyEl = document.getElementById('bp-price-quarterly');
    const halfEl = document.getElementById('bp-price-halfyearly');
    const yearlyEl = document.getElementById('bp-price-yearly');
    const yearlyHelpEl = document.getElementById('bp-yearly-help');
    if (monthlyEl) monthlyEl.textContent = `$${prices.monthly}/month`;
    if (quarterlyEl) quarterlyEl.textContent = `$${prices.quarterly}/quarter`;
    if (halfEl) halfEl.textContent = `$${prices.halfyearly}/6 months`;
    if (yearlyEl) yearlyEl.textContent = `Multi-licence (first $${prices.yearly}/year, additional $${prices.yearlyAdditional}/year each)`;
    if (yearlyHelpEl) {
        yearlyHelpEl.textContent = `Yearly pricing is handled by PayPal plan tiers: first licence $${prices.yearly}/year, each additional licence $${prices.yearlyAdditional}/year. Quantity renews annually until cancelled.`;
    }
}

// Payment Modal Functions
function showPaymentModal(packageCode = 'quartz', subscriptionType = 'monthly') {
    // Backward compatibility: showPaymentModal('monthly') from old buttons
    if (PACKAGE_PRICES[packageCode] == null) {
        subscriptionType = packageCode;
        packageCode = selectedPackageCode || 'quartz';
    }
    const cycle = normalizeCycleKey(subscriptionType);
    selectedPackageCode = PACKAGE_PRICES[packageCode] ? packageCode : 'quartz';
    console.log('Opening payment modal for package/cycle:', selectedPackageCode, cycle);
    
    const paymentModal = document.getElementById('paymentModal');
    
    if (!paymentModal) {
        console.error('Payment modal element not found!');
        alert('Payment modal not found. Please refresh the page.');
        return;
    }
    
    // Set the correct radio button based on subscriptionType
    updatePlanOptionLabels(selectedPackageCode);

    const radioButton = document.querySelector(`input[name="bp_plan"][value="${cycle}"]`);
    if (radioButton) {
        radioButton.checked = true;
        syncYearlyUI();
    }
    
    // Show the modal
    paymentModal.style.display = 'block';
    console.log('Modal displayed, initializing PayPal...');
    
    // Wait a moment for modal to render, then initialize PayPal
    setTimeout(function() {
        initializePayPalSubscription();
    }, 100);
}

// Sync yearly quantity UI visibility
function syncYearlyUI() {
    const isYearly = getSelectedPlanKey() === "yearly";
    const yearlyQtyWrap = document.getElementById("bp_yearly_qty_wrap");
    if (yearlyQtyWrap) {
        yearlyQtyWrap.style.display = isYearly ? "block" : "none";
    }
    // Reinitialize PayPal button when plan changes
    if (typeof paypal !== 'undefined' && typeof paypal.Buttons === 'function') {
        setTimeout(function() {
            initializePayPalSubscription();
        }, 100);
    }
}

// Get selected plan key from radio buttons
function getSelectedPlanKey() {
    const selected = document.querySelector('input[name="bp_plan"]:checked');
    return selected ? normalizeCycleKey(selected.value) : 'monthly';
}

function getSelectedPlanId() {
    const cycle = getSelectedPlanKey();
    const packagePlans = PLAN_IDS[selectedPackageCode] || PLAN_IDS.quartz;
    return packagePlans[cycle] || null;
}

// Get yearly quantity
function getYearlyQty() {
    const qtyInput = document.getElementById("bp_yearly_qty");
    if (!qtyInput) return "1";
    const raw = parseInt(qtyInput.value, 10);
    const qty = (!raw || raw < 1) ? 1 : raw;
    return String(qty); // PayPal expects a string
}

function closePaymentModal() {
    document.getElementById('paymentModal').style.display = 'none';
}

// Close modals when clicking outside
window.onclick = function(event) {
    const registrationModal = document.getElementById('registrationModal');
    const paymentModal = document.getElementById('paymentModal');
    
    if (event.target === registrationModal) {
        closeRegistrationModal();
    }
    if (event.target === paymentModal) {
        closePaymentModal();
    }
}

// Registration Form Handler
document.addEventListener('DOMContentLoaded', function() {
    const registrationForm = document.getElementById('registrationForm');
    if (registrationForm) {
        registrationForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Get form data
            const firstName = document.getElementById('firstName').value.trim();
            const lastName = document.getElementById('lastName').value.trim();
            const email = document.getElementById('email').value.trim();
            const platformField = document.getElementById('platform');
            let platform = platformField ? platformField.value.trim() : '';
            const company = document.getElementById('company').value.trim();
            const phone = document.getElementById('phone').value.trim();
            const addressLine1 = document.getElementById('addressLine1') ? document.getElementById('addressLine1').value.trim() : '';
            const city = document.getElementById('city') ? document.getElementById('city').value.trim() : '';
            const country = document.getElementById('country') ? document.getElementById('country').value.trim() : '';
            const source = document.getElementById('source') ? document.getElementById('source').value : '';
            
            // Ensure platform is captured (form field, selectedPlatform, or browser detection)
            const selectedPlatform = localStorage.getItem('selectedPlatform');
            const inferredPlatform = detectPlatformFromBrowser();
            if (!platform) {
                if (selectedPlatform === 'windows') {
                    platform = 'Windows';
                } else if (selectedPlatform === 'mac') {
                    platform = 'macOS';
                } else if (inferredPlatform) {
                    platform = inferredPlatform;
                }
                if (platformField && platform) {
                    platformField.value = platform;
                }
            }
            if (!platform) {
                showMessage('Platform is required. Please click the download button again.', 'error');
                return;
            }
            
            // Basic validation - ensure required fields are filled
            if (!firstName || !lastName || !email || !city || !country) {
                showMessage('Please fill in all required fields (First Name, Last Name, Email, City, and Country).', 'error');
                return;
            }
            
            // Email validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                showMessage('Please enter a valid email address.', 'error');
                return;
            }
            
            // Check if platform was selected (should be set by downloadForPlatform)
            if (!selectedPlatform) {
                showMessage('Please select a platform by clicking the download button again.', 'error');
                return;
            }
            
            console.log('Form submitted for platform:', selectedPlatform);
            
            // Store customer data (NO customer number for trial registrations)
            const customerData = {
                firstName: firstName,
                lastName: lastName,
                email: email,
                platform: platform,
                company: company,
                phone: phone,
                timestamp: new Date().toISOString(),
                type: 'trial_registration'
            };
            
            localStorage.setItem('customerData', JSON.stringify(customerData));
            
            // Close modal first
            closeRegistrationModal();
            
            // Get platform to show appropriate message
            const isWindows = selectedPlatform === 'windows';
            if (isWindows) {
                showMessage('Redirecting to Microsoft Store... Check your email for welcome instructions.', 'success');
            } else {
                showMessage('Download starting... Check your email for welcome instructions.', 'success');
            }
            
            // Prepare email data
            // Get platform from form field to ensure it's captured
            const platformFromForm = platformField ? platformField.value.trim() : platform;
            const finalPlatform = platformFromForm || platform || inferredPlatform || 'Unknown';
            
            console.log('Platform values:', {
                fromForm: platformFromForm,
                fromVariable: platform,
                final: finalPlatform
            });
            
            const emailData = {
                action: 'trial_registration',
                firstName: firstName,
                lastName: lastName,
                email: email,
                platform: finalPlatform, // Use final platform value
                company: company,
                phone: phone,
                addressLine1: addressLine1,
                city: city,
                country: country,
                source: source
                // NOTE: Customer numbers are NOT assigned for trial registrations
                // Customer numbers are only assigned when a subscription is purchased
            };
            
            console.log('Sending email with data:', emailData);
            console.log('Platform being sent:', emailData.platform);
            
            // Email API endpoint
            console.log('Attempting to send email to:', EMAIL_ENDPOINT);
            
            // CRITICAL: Send email FIRST, then trigger download
            // Use keepalive to ensure request completes even if page navigates
            const emailPromise = fetch(EMAIL_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(emailData),
                mode: 'cors',
                credentials: 'omit',
                keepalive: true // Keep request alive even if page navigates
            });
            
            // Start email request, then trigger download after a short delay
            // This ensures the email request starts before page navigation
            emailPromise
            .then(async response => {
                if (!response || !response.ok) {
                    throw new Error(`HTTP ${response?.status || 'unknown'}`);
                }
                
                console.log('Email API response status:', response.status);
                
                // Try to parse response body
                let responseData;
                try {
                    const text = await response.text();
                    console.log('Email API response text:', text);
                    responseData = text ? JSON.parse(text) : {};
                } catch (parseError) {
                    console.warn('Could not parse response as JSON:', parseError);
                    responseData = {};
                }
                
                if (response.ok && responseData.ok !== false) {
                    console.log('✅ Registration email sent successfully');
                } else {
                    const errorMsg = responseData.error || responseData.message || `HTTP ${response.status}`;
                    console.error('❌ Registration email submission failed:', errorMsg);
                    console.error('Full response:', responseData);
                }
            })
            .catch(error => {
                console.error('❌ Network error sending registration email:', error);
                console.error('Error details:', {
                    message: error.message,
                    name: error.name
                });
            });
            
            // Trigger download after a short delay to let email request start
            // Use setTimeout to ensure email fetch initiates before download redirects
            setTimeout(() => {
                console.log('Starting download/redirect for platform:', selectedPlatform);
                startDownload();
            }, 300); // 300ms delay to let email request start
        });
    }
});

// Scroll to Download Section
function scrollToDownload() {
    try {
        const downloadSection = document.getElementById('download');
        if (downloadSection) {
            downloadSection.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        } else {
            console.error('Download section not found');
            // Fallback: scroll to top
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    } catch (error) {
        console.error('Error in scrollToDownload:', error);
    }
}

// Download for Specific Platform (shows registration first)
function downloadForPlatform(platform) {
    try {
        // Validate platform
        if (platform !== 'windows' && platform !== 'mac') {
            console.error('Invalid platform:', platform);
            showMessage('Invalid platform selected. Please try again.', 'error');
            return;
        }
        
        // Store selected platform FIRST before showing modal
        // This ensures platform is available when form is submitted
        if (typeof Storage !== 'undefined') {
            localStorage.setItem('selectedPlatform', platform);
            console.log('Platform stored:', platform);
        } else {
            console.error('localStorage not available');
            showMessage('Your browser does not support local storage. Please update your browser.', 'error');
            return;
        }
        
        // Show registration modal
        if (typeof showRegistrationModal === 'function') {
            showRegistrationModal();
        } else {
            console.error('showRegistrationModal function not found');
            // Fallback: try to find and show modal directly
            const modal = document.getElementById('registrationModal');
            if (modal) {
                modal.style.display = 'block';
            } else {
                showMessage('Registration form not found. Please refresh the page.', 'error');
            }
        }
    } catch (error) {
        console.error('Error in downloadForPlatform:', error);
        showMessage('An error occurred. Please try again.', 'error');
    }
}

// Make sure functions are available globally
window.scrollToDownload = scrollToDownload;
window.downloadForPlatform = downloadForPlatform;

// Start Download Function (called after registration form submission)
function startDownload() {
    console.log('startDownload() called');
    
    // Get selected platform from localStorage (set by downloadForPlatform)
    const selectedPlatform = localStorage.getItem('selectedPlatform');
    console.log('Retrieved platform from localStorage:', selectedPlatform);
    
    // Platform MUST be set by downloadForPlatform - if not, show error
    if (!selectedPlatform) {
        console.error('No platform selected - download cannot proceed');
        showMessage('Platform not selected. Please click the download button again.', 'error');
        return;
    }
    
    const platform = selectedPlatform;
    console.log('Starting download for platform:', platform);
    
    // If Windows, redirect to Microsoft Store instead of downloading
    if (platform === 'windows') {
        console.log('Platform is Windows - redirecting to Microsoft Store');
        
        // Track Microsoft Store redirect
        if (typeof gtag !== 'undefined') {
            gtag('event', 'microsoft_store_redirect', {
                'event_category': 'Download',
                'event_label': 'Microsoft Store Redirect After Registration',
                'value': 1
            });
        }
        
        if (typeof fbq !== 'undefined') {
            fbq('track', 'Lead', {
                content_name: 'Microsoft Store Redirect',
                content_category: 'Download'
            });
        }
        
        // Redirect to Microsoft Store - BUILDPRAX MEASURE PRO
        // Store ID: 9NCJXG15QZS3
        // Web Store URL: https://apps.microsoft.com/detail/9NCJXG15QZS3
        const storeWebUrl = 'https://apps.microsoft.com/detail/9NCJXG15QZS3';
        
        // Detect if user is actually on Windows
        const isActuallyWindows = navigator.platform.toUpperCase().includes('WIN') || 
                                  navigator.userAgent.toUpperCase().includes('WINDOWS');
        
        console.log('Is actually Windows:', isActuallyWindows);
        
        if (isActuallyWindows) {
            // On Windows: Try deep link first, then fallback to web URL
            console.log('Attempting deep link to Microsoft Store');
            const storeDeepLink = 'ms-windows-store://pdp/?productid=9NCJXG15QZS3';
            window.location.href = storeDeepLink;
            // Fallback to web URL after short delay
            setTimeout(() => {
                console.log('Fallback: redirecting to web URL');
                window.location.href = storeWebUrl;
            }, 1000);
        } else {
            // On Mac/other: Open in new tab (Safari can't redirect to Microsoft Store)
            console.log('Opening Microsoft Store in new tab');
            window.open(storeWebUrl, '_blank');
            // Show message that they need to be on Windows
            showMessage('Please visit the Microsoft Store on a Windows computer to download the app. The Store link has been opened in a new tab.', 'success');
        }
        
        // Track redirect
        const downloads = JSON.parse(localStorage.getItem('downloads') || '[]');
        downloads.push({
            timestamp: new Date().toISOString(),
            type: 'microsoft_store_redirect',
            platform: 'windows'
        });
        localStorage.setItem('downloads', JSON.stringify(downloads));
        
        // Clear selected platform
        localStorage.removeItem('selectedPlatform');
        return;
    }
    
    // For Mac, proceed with download
    console.log('Platform is Mac - starting download');
    
    // Determine download URL and filename based on platform
    let downloadLink, filename;
    
    if (platform === 'mac') {
        // Updated to latest notarized/stapled release
        downloadLink = 'https://buildprax-downloads.sfo3.digitaloceanspaces.com/BuildpraxMeasurePro_1.0.10.0.dmg';
        filename = 'BuildpraxMeasurePro_1.0.10.0.dmg';
    } else {
        // Default to Mac
        downloadLink = 'https://buildprax-downloads.sfo3.digitaloceanspaces.com/BuildpraxMeasurePro_1.0.10.0.dmg';
        filename = 'BuildpraxMeasurePro_1.0.10.0.dmg';
    }
    
    console.log('Download link:', downloadLink);
    console.log('Filename:', filename);
    
    // For cross-origin downloads, use window.location or window.open
    // The download attribute doesn't work for cross-origin URLs
    try {
        // Try to trigger download by opening the URL
        // This will work better for cross-origin downloads
        window.location.href = downloadLink;
        console.log('Download triggered via window.location');
    } catch (error) {
        console.warn('window.location failed, trying window.open:', error);
        // Fallback to opening in new tab
        window.open(downloadLink, '_blank');
    }
    
    // Track download
    const downloads = JSON.parse(localStorage.getItem('downloads') || '[]');
    downloads.push({
        timestamp: new Date().toISOString(),
        type: 'trial_download',
        platform: platform
    });
    localStorage.setItem('downloads', JSON.stringify(downloads));
    
    // Clear selected platform
    localStorage.removeItem('selectedPlatform');
}

// Initialize PayPal subscription buttons (called when modal opens or plan changes)
function initializePayPalSubscription() {
    // Clear existing buttons
    const container = document.getElementById('paypal-button-container');
    const errorDiv = document.getElementById('bp_paypal_error');
    
    if (!container) {
        console.error('PayPal button container not found');
        return;
    }
    
    container.innerHTML = '';
    if (errorDiv) {
        errorDiv.style.display = 'none';
    }
    
    // Check if PayPal SDK is loaded
    if (typeof paypal === 'undefined' || typeof paypal.Buttons === 'undefined') {
        console.error('PayPal SDK not loaded');
        if (errorDiv) {
            errorDiv.style.display = 'block';
        }
        return;
    }
    
    try {
        paypal.Buttons({
            style: { 
                shape: "pill", 
                color: "gold", 
                layout: "vertical", 
                label: "subscribe" 
            },

            // Create the subscription for the selected plan
            createSubscription: function (data, actions) {
                const key = getSelectedPlanKey();
                const planId = getSelectedPlanId();

                if (!planId) {
                    console.error('Invalid package/cycle:', selectedPackageCode, key);
                    throw new Error('Invalid subscription plan selected');
                }

                const payload = { plan_id: planId };

                // CRITICAL: yearly supports multiple licences. Quantity must be passed to PayPal.
                // PayPal will then charge using the tier rules and renew annually at that quantity until cancelled.
                if (key === "yearly") {
                    payload.quantity = getYearlyQty();
                    console.log('Creating yearly subscription with quantity:', payload.quantity);
                }

                console.log('Creating PayPal subscription:', payload);
                return actions.subscription.create(payload);
            },

            onApprove: function (data, actions) {
                console.log('Subscription approved:', data);
                
                // Get subscription details
                return actions.subscription.get().then(function(details) {
                    console.log('Subscription details:', details);
                    
                    // Get customer email from subscription details
                    const subscriber = details.subscriber;
                    const userEmail = subscriber && subscriber.email_address ? subscriber.email_address : '';
                    
                    if (!userEmail) {
                        console.error('No email found in subscription details');
                        showMessage('Subscription created but could not retrieve email. Please contact support@buildprax.com with your subscription ID: ' + data.subscriptionID, 'error');
                        return;
                    }
                    
                    // Get subscription type and quantity
                    const key = getSelectedPlanKey();
                    const subscriptionType = key === 'halfyearly' ? 'half-yearly' : key;
                    const packageCode = selectedPackageCode;
                    
                    // For annual subscriptions, get quantity from input
                    // For non-annual, always 1 license
                    let quantity = 1;
                    if (key === 'yearly') {
                        quantity = parseInt(getYearlyQty(), 10) || 1;
                        if (quantity < 1) quantity = 1;
                    }
                    const additionalLicenses = key === 'yearly' ? Math.max(0, quantity - 1) : 0;
                    
                    // Generate and send license keys
                    sendLicenseKey(userEmail, {
                        id: data.subscriptionID,
                        subscriptionID: data.subscriptionID,
                        status: details.status || 'ACTIVE',
                        type: 'subscription'
                    }, subscriptionType, additionalLicenses, quantity, packageCode);
                    
                    // Close modal
                    closePaymentModal();
                    
                    // Show success message
                    const renewalPeriod = subscriptionType === 'monthly' ? 'month' : subscriptionType === 'quarterly' ? '3 months' : subscriptionType === 'half-yearly' || subscriptionType === 'halfyearly' ? '6 months' : 'year';
                    const licenseText = quantity > 1 ? `${quantity} licenses` : '1 license';
                    showMessage(`Subscription successful! Your subscription is active. Your license key${quantity > 1 ? 's' : ''} have been sent to your email. Your subscription will renew automatically every ${renewalPeriod} until you cancel from your PayPal account.`, 'success');
                }).catch(function(err) {
                    console.error('Error getting subscription details:', err);
                    // Still process the subscription even if details fetch fails
                    const customerData = JSON.parse(localStorage.getItem('customerData') || '{}');
                    const userEmail = customerData.email || '';
                    if (userEmail) {
                        const key = getSelectedPlanKey();
                        const subscriptionType = key === 'halfyearly' ? 'half-yearly' : key;
                        const packageCode = selectedPackageCode;
                        let quantity = 1;
                        if (key === 'yearly') {
                            quantity = parseInt(getYearlyQty(), 10) || 1;
                            if (quantity < 1) quantity = 1;
                        }
                        const additionalLicenses = key === 'yearly' ? Math.max(0, quantity - 1) : 0;
                        
                        sendLicenseKey(userEmail, {
                            id: data.subscriptionID,
                            subscriptionID: data.subscriptionID,
                            status: 'ACTIVE',
                            type: 'subscription'
                        }, subscriptionType, additionalLicenses, quantity, packageCode);
                        
                        closePaymentModal();
                        showMessage(`Subscription successful! Your license key${quantity > 1 ? 's' : ''} have been sent to your email.`, 'success');
                    }
                });
            },

            onError: function (err) {
                console.error("PayPal Buttons error:", err);
                if (errorDiv) {
                    errorDiv.style.display = "block";
                }
                showMessage('Subscription setup failed. Please try again or contact support@buildprax.com', 'error');
            },
            
            onCancel: function (data) {
                console.log('Subscription cancelled:', data);
                showMessage('Subscription setup was cancelled.', 'info');
            }
        }).render("#paypal-button-container");
    } catch (e) {
        console.error('Error initializing PayPal:', e);
        if (errorDiv) {
            errorDiv.style.display = "block";
        }
    }
}

// Set up radio button and quantity input change listeners
document.addEventListener('DOMContentLoaded', function() {
    // Wait for modal to be available
    setTimeout(function() {
        const planRadios = document.querySelectorAll('input[name="bp_plan"]');
        if (planRadios.length > 0) {
            planRadios.forEach(r => r.addEventListener("change", syncYearlyUI));
            console.log('PayPal plan radio buttons initialized');
        }
        
        // Listen for yearly quantity changes
        const yearlyQtyInput = document.getElementById('bp_yearly_qty');
        if (yearlyQtyInput) {
            yearlyQtyInput.addEventListener('change', function() {
                // Reinitialize PayPal when quantity changes (only if yearly is selected)
                if (getSelectedPlanKey() === 'yearly') {
                    setTimeout(function() {
                        initializePayPalSubscription();
                    }, 100);
                }
            });
            console.log('Yearly quantity input listener initialized');
        }
    }, 500);
});

// Card payment is now handled by PayPal SDK - no separate function needed

// Send License Key Function - Updated with customer number, subscription type, and multiple licenses
function sendLicenseKey(email, paymentDetails, subscriptionType = 'yearly', additionalLicenses = 0, totalLicenses = 1, packageCode = 'quartz') {
    // Get or create customer number ONLY when subscription is purchased
    // Customer numbers are NOT assigned for trial downloads, only for paid subscriptions
    const customerNumber = getCustomerNumber(email);
    
    // Get customer data for name
    const customerData = JSON.parse(localStorage.getItem('customerData') || '{}');
    const firstName = customerData.firstName || '';
    const lastName = customerData.lastName || '';
    
    // Generate license keys for all licenses (first + additional)
    const licenseKeys = [];
    for (let i = 0; i < totalLicenses; i++) {
        licenseKeys.push(generateLicenseKey(subscriptionType));
    }
    
    // Store license keys
    const licenses = JSON.parse(localStorage.getItem('licenses') || '[]');
    const pkg = PACKAGE_PRICES[packageCode] || PACKAGE_PRICES.quartz;
    const normalizedSubType = normalizeCycleKey(subscriptionType);
    const basePrice = normalizedSubType === 'monthly'
        ? Number(pkg.monthly)
        : normalizedSubType === 'quarterly'
            ? Number(pkg.quarterly)
            : normalizedSubType === 'halfyearly'
                ? Number(pkg.halfyearly)
                : Number(pkg.yearly);
    const additionalPrice = Number(pkg.yearlyAdditional);
    const totalAmount = basePrice + (additionalLicenses * additionalPrice);
    
    licenseKeys.forEach((key, index) => {
        licenses.push({
            email: email,
            licenseKey: key,
            customerNumber: customerNumber,
            subscriptionType: subscriptionType,
            packageCode: packageCode,
            licenseNumber: index + 1,
            totalLicenses: licenseKeys.length,
            timestamp: new Date().toISOString(),
            paymentId: paymentDetails.id || paymentDetails.subscriptionID || 'manual',
            subscriptionID: paymentDetails.subscriptionID || null,
            isRecurring: !!paymentDetails.subscriptionID,
            amount: totalAmount.toFixed(2)
        });
    });
    localStorage.setItem('licenses', JSON.stringify(licenses));
    
    // Send license key email to customer (with ALL keys) and notification to support
    fetch(EMAIL_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            action: 'license_purchase',
            firstName: firstName,
            lastName: lastName,
            email: email,
            company: customerData.company || '',
            phone: customerData.phone || '',
            addressLine1: customerData.addressLine1 || '',
            city: customerData.city || '',
            country: customerData.country || '',
            source: '',
            licenseKey: licenseKeys.join(', '), // Send all keys if multiple
            customerNumber: customerNumber,
            subscriptionType: subscriptionType,
            packageCode: packageCode,
            totalLicenses: totalLicenses,
            paymentId: paymentDetails.id || paymentDetails.subscriptionID || 'manual',
            subscriptionID: paymentDetails.subscriptionID || null,
            isRecurring: !!paymentDetails.subscriptionID,
            amount: totalAmount.toFixed(2)
        })
    })
    .then(response => {
        if (response.ok) {
            console.log('License key email sent to customer and notification sent to support');
        } else {
            console.error('Failed to send license key email:', response.status);
        }
    })
    .catch(error => {
        console.error('Error sending license key email:', error);
    });
    
    console.log('License keys generated:', licenseKeys);
    console.log('Customer number:', customerNumber);
}

// Get or create customer number for an email
// IMPORTANT: Customer numbers are ONLY assigned when a subscription is purchased, NOT for trial downloads
// Customer numbers are FIXED FOR LIFE - same email always gets same number
// First customer: cathalcorbett@gmail.com = BMP000101
function getCustomerNumber(email) {
    if (!email) return '';
    
    const normalizedEmail = email.toLowerCase().trim();
    
    // CRITICAL: First customer - Cathal Corbett - Fixed number BMP000101
    if (normalizedEmail === 'cathalcorbett@gmail.com') {
        console.log('Using fixed customer number for Cathal Corbett: BMP000101');
        return 'BMP000101';
    }
    
    // Check if customer already has a number (from previous subscription)
    const customerNumbers = JSON.parse(localStorage.getItem('customerNumbers') || '{}');
    if (customerNumbers[normalizedEmail]) {
        console.log('Using existing customer number for:', normalizedEmail, customerNumbers[normalizedEmail]);
        return customerNumbers[normalizedEmail];
    }
    
    // Generate new customer number (only called when subscription is purchased)
    // Start from 102 (101 is reserved for Cathal)
    const existingNumbers = Object.values(customerNumbers);
    let num = 102;
    while (existingNumbers.includes(`BMP${String(num).padStart(5, '0')}`)) {
        num++;
        if (num > 99999) num = 102; // Reset if we hit the limit
    }
    
    const customerNumber = `BMP${String(num).padStart(5, '0')}`;
    customerNumbers[normalizedEmail] = customerNumber;
    localStorage.setItem('customerNumbers', JSON.stringify(customerNumbers));
    console.log('Generated new customer number for subscription purchase:', normalizedEmail, customerNumber);
    return customerNumber;
}

// Generate License Key Function - Updated to support subscription types
function generateLicenseKey(subscriptionType = 'yearly') {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    
    function generateRandomString(length) {
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
    
    // Generate key based on subscription type
    switch(subscriptionType.toLowerCase()) {
        case 'monthly':
            return `BUILDPRAX-MON-${generateRandomString(6)}-${generateRandomString(6)}`;
        case 'quarterly':
            return `BUILDPRAX-QTR-${generateRandomString(6)}-${generateRandomString(6)}`;
        case 'halfyearly':
        case 'half-yearly':
            return `BUILDPRAX-HLF-${generateRandomString(6)}-${generateRandomString(6)}`;
        case 'yearly':
        default:
            const year = new Date().getFullYear() + 1;
            return `BUILDPRAX-${year}-${generateRandomString(6)}-${generateRandomString(6)}`;
    }
}

// Show Message Function
function showMessage(text, type) {
    // Remove existing messages
    const existingMessage = document.querySelector('.message');
    if (existingMessage) {
        existingMessage.remove();
    }
    
    // Create new message
    const message = document.createElement('div');
    message.className = `message ${type}`;
    message.textContent = text;
    
    // Insert at top of body
    document.body.insertBefore(message, document.body.firstChild);
    
    // Remove after 5 seconds
    setTimeout(() => {
        message.remove();
    }, 5000);
}

function membersStateKey() {
    return 'bpMembersAuth';
}

function saveMembersState(state) {
    localStorage.setItem(membersStateKey(), JSON.stringify(state));
}

function getMembersState() {
    try {
        return JSON.parse(localStorage.getItem(membersStateKey()) || '{}');
    } catch (e) {
        return {};
    }
}

function clearMembersState() {
    localStorage.removeItem(membersStateKey());
}

function renderMembersStatus(data) {
    const panel = document.getElementById('membersStatusPanel');
    if (!panel) return;
    if (!data) {
        panel.innerHTML = '<p style="color:#64748b;">Sign in to view your current entitlement.</p>';
        return;
    }

    panel.innerHTML = `
        <p><strong>Email:</strong> ${data.email || '-'}</p>
        <p><strong>Status:</strong> ${data.state || '-'}</p>
        <p><strong>Package:</strong> ${data.packageCode || 'Trial'}</p>
        <p><strong>Trial Ends:</strong> ${data.trialEndsAt || '-'}</p>
        <p><strong>Paid Ends:</strong> ${data.paidEndsAt || '-'}</p>
        <p><strong>Grace Ends:</strong> ${data.graceEndsAt || '-'}</p>
    `;
}

async function authApiFetch(pathSuffix, options = {}) {
    const primaryBase = getAuthApiBase();
    const isProdWeb = typeof window !== 'undefined' && /^(www\.)?buildprax\.com$/i.test(window.location.hostname || '');
    const bases = [primaryBase];
    // In production website, force proxy only to avoid direct endpoint 204 responses.
    if (!isProdWeb && primaryBase !== AUTH_API_DIRECT) bases.push(AUTH_API_DIRECT);
    const merged = {
        cache: 'no-store',
        ...options,
        headers: {
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
            ...(options.headers || {}),
        },
    };
    let lastNetworkError = null;
    let lastResponse = null;
    for (const base of bases) {
        try {
            const url = `${base}${pathSuffix}`;
            const response = await fetch(url, merged);
            // If proxy route is stale/broken, silently retry direct auth endpoint.
            if (base !== AUTH_API_DIRECT && (response.status === 404 || response.status >= 500)) {
                lastResponse = response;
                continue;
            }
            return response;
        } catch (err) {
            lastNetworkError = err;
        }
    }
    if (lastResponse) return lastResponse;
    throw lastNetworkError || new Error('Auth network request failed.');
}

function parseAuthJsonResponse(raw) {
    const s = String(raw || '').replace(/^\uFEFF/, '').trim();
    if (!s) return {};
    try {
        return JSON.parse(s);
    } catch {
        return {};
    }
}

/** Some gateways return OpenWhisk-style { body: "<json>" } instead of raw JSON. */
function normalizeAuthApiEnvelope(payload) {
    let p = payload;
    for (let i = 0; i < 5 && p && typeof p === 'object'; i++) {
        if (p.body != null && typeof p.body === 'object' && !Array.isArray(p.body)) {
            p = p.body;
            continue;
        }
        if (typeof p.body !== 'string') break;
        const t = p.body.trim();
        if (!t.startsWith('{') && !t.startsWith('[')) break;
        try {
            const inner = JSON.parse(t);
            if (!inner || typeof inner !== 'object') break;
            p = inner;
        } catch {
            break;
        }
    }
    return p;
}

function applyAuthTokenAliases(payload) {
    if (!payload || typeof payload !== 'object') return payload;
    const out = { ...payload };
    if (!out.accessToken && out.access_token) out.accessToken = out.access_token;
    if (!out.refreshToken && out.refresh_token) out.refreshToken = out.refresh_token;
    return out;
}

async function membersLogin(email, password) {
    const loginBody = JSON.stringify({ email, password, rememberMe: true });
    const loginHeaders = { 'Content-Type': 'application/json' };

    /** Fresh URL every time so caches/SW cannot treat POST like a cached OPTIONS 204 for a stable path. */
    async function loginOnce(pathBase) {
        const sep = pathBase.includes('?') ? '&' : '?';
        const suffix = `${pathBase}${sep}cb=${Date.now()}&n=${Math.random().toString(36).slice(2, 11)}`;
        const response = await authApiFetch(suffix, {
            method: 'POST',
            headers: loginHeaders,
            body: loginBody,
        });
        const raw = await response.text();
        return { response, raw };
    }

    function routeNotFound404(response, raw) {
        if (response.status !== 404) return false;
        const j = parseAuthJsonResponse(raw);
        return j?.code === 'NOT_FOUND' || String(j?.message || '').includes('Route not found');
    }

    function isEmptySuccessHiccup(response, raw) {
        if (response.status === 204 || response.status === 304) return true;
        if (response.ok && !String(raw || '').trim()) return true;
        return false;
    }

    // Production currently supports /auth/login reliably; avoid /auth/session cache ghosts in browsers.
    const pathCycle = ['/auth/login', '/auth/login', '/auth/login'];
    let last = { response: { status: 0 }, raw: '' };

    for (const pathBase of pathCycle) {
        const attempt = await loginOnce(pathBase);
        last = attempt;
        const { response, raw } = attempt;

        if (routeNotFound404(response, raw)) continue;
        if (isEmptySuccessHiccup(response, raw)) continue;

        if (String(raw || '').trimStart().startsWith('<')) {
            // Transient gateway/proxy pages are usually HTML. Treat them as retryable in-loop noise.
            continue;
        }

        const payload = applyAuthTokenAliases(normalizeAuthApiEnvelope(parseAuthJsonResponse(raw)));
        if (!response.ok) {
            const msg = payload.message || payload.code || `Sign-in failed (${response.status}).`;
            throw new Error(msg);
        }
        if (payload.confirmationRequired && payload.preAuthToken) {
            throw new Error('This account needs licensed-device confirmation in the Buildprax Measure Pro desktop app. Website sign-in is not available for this step.');
        }
        if (payload.ok === false) {
            const msg = payload.message || payload.code || 'Sign-in failed. Check your password or try again.';
            throw new Error(msg);
        }
        if (!payload.accessToken) {
            throw new Error('Sign-in response did not include a session token. Try a hard refresh (clear cache) or use the desktop app. If it persists, your network may be altering API responses.');
        }
        return payload;
    }

    const st = last.response?.status;
    if (st === 204 || st === 304) {
        const host = typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : 'this site';
        throw new Error(
            `Sign-in still returned HTTP ${st} with no body after several tries (often a browser cache, extension, or service worker on ${host}, not the API). Try: private/incognito, unregister any service worker for ${host}, another browser, or the Measure Pro desktop app.`,
        );
    }
    if (last.response?.ok && !String(last.raw || '').trim()) {
        throw new Error(
            'Sign-in still returned an empty body after retries. Try another network or browser; if you use Cloudflare or a cache in front of the auth API, purge cache for that endpoint.',
        );
    }
    throw new Error('Sign-in could not get a valid response from the auth service. Try again shortly or use the desktop app.');
}

async function fetchMembersEntitlement(accessToken) {
    const response = await authApiFetch('/auth/entitlement', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
        throw new Error(payload.message || 'Could not read entitlement');
    }
    return payload;
}

async function refreshMembersToken(refreshToken) {
    const response = await authApiFetch('/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
        throw new Error(payload.message || 'Session refresh failed');
    }
    return payload;
}

async function updateMembersEntitlementFromStoredState() {
    const state = getMembersState();
    if (!state || !state.accessToken) {
        renderMembersStatus(null);
        return;
    }
    try {
        const entitlement = await fetchMembersEntitlement(state.accessToken);
        renderMembersStatus({
            email: state.email,
            state: entitlement.state,
            packageCode: entitlement.packageCode,
            trialEndsAt: entitlement.trialEndsAt,
            paidEndsAt: entitlement.paidEndsAt,
            graceEndsAt: entitlement.graceEndsAt
        });
    } catch (error) {
        if (!state.refreshToken) {
            renderMembersStatus(null);
            return;
        }
        const refreshed = await refreshMembersToken(state.refreshToken);
        const nextState = {
            ...state,
            accessToken: refreshed.accessToken,
            refreshToken: refreshed.refreshToken || state.refreshToken
        };
        saveMembersState(nextState);
        const entitlement = await fetchMembersEntitlement(nextState.accessToken);
        renderMembersStatus({
            email: nextState.email,
            state: entitlement.state,
            packageCode: entitlement.packageCode,
            trialEndsAt: entitlement.trialEndsAt,
            paidEndsAt: entitlement.paidEndsAt,
            graceEndsAt: entitlement.graceEndsAt
        });
    }
}

function initializeMembersArea() {
    const loginForm = document.getElementById('membersLoginForm');
    const refreshBtn = document.getElementById('membersRefreshBtn');
    const logoutBtn = document.getElementById('membersLogoutBtn');
    const modeLoginBtn = document.getElementById('membersModeLoginBtn');
    const modeSignupBtn = document.getElementById('membersModeSignupBtn');
    const nameWrap = document.getElementById('membersNameWrap');
    const passwordConfirmWrap = document.getElementById('membersPasswordConfirmWrap');
    const submitBtn = document.getElementById('membersSubmitBtn');
    const forgotPasswordBtn = document.getElementById('membersForgotPasswordBtn');
    const resendVerifyBtn = document.getElementById('membersResendVerifyBtn');
    const backToChoiceBtn = document.getElementById('membersBackToChoiceBtn');
    const choiceWrap = document.getElementById('membersChoiceWrap');
    const formFieldsWrap = document.getElementById('membersFormFieldsWrap');
    const formStepHint = document.getElementById('membersFormStepHint');
    if (!loginForm) return;
    let membersMode = 'login';
    /** 'choice' = only Sign In / Create Account buttons; 'form' = email/password step */
    let membersPhase = 'choice';
    const inlineMessageEl = document.getElementById('membersInlineMessage');

    const showMembersPhase = (phase) => {
        membersPhase = phase === 'form' ? 'form' : 'choice';
        if (choiceWrap) choiceWrap.style.display = membersPhase === 'choice' ? 'block' : 'none';
        if (formFieldsWrap) formFieldsWrap.style.display = membersPhase === 'form' ? 'block' : 'none';
    };

    const syncMembersModeUi = () => {
        if (nameWrap) nameWrap.style.display = membersMode === 'signup' ? 'block' : 'none';
        if (passwordConfirmWrap) passwordConfirmWrap.style.display = membersMode === 'signup' ? 'block' : 'none';
        if (submitBtn) submitBtn.textContent = membersMode === 'signup' ? 'Create account' : 'Sign in';
        if (modeLoginBtn) modeLoginBtn.style.opacity = membersMode === 'login' ? '1' : '0.75';
        if (modeSignupBtn) modeSignupBtn.style.opacity = membersMode === 'signup' ? '1' : '0.75';
        if (formStepHint) {
            formStepHint.textContent =
                membersMode === 'signup'
                    ? 'Enter your details below, then create your account. You will verify your email before your first sign-in.'
                    : 'Enter your email and password below, then sign in.';
        }
        if (forgotPasswordBtn) forgotPasswordBtn.style.display = membersMode === 'login' ? 'inline-block' : 'none';
        if (resendVerifyBtn) resendVerifyBtn.style.display = 'inline-block';
    };
    const showInlineMessage = (text, kind = 'error') => {
        if (!inlineMessageEl) return;
        inlineMessageEl.style.display = 'block';
        inlineMessageEl.textContent = text;
        inlineMessageEl.style.color = kind === 'success' ? '#065f46' : '#991b1b';
    };
    const clearInlineMessage = () => {
        if (!inlineMessageEl) return;
        inlineMessageEl.style.display = 'none';
        inlineMessageEl.textContent = '';
    };

    window.setMembersMode = (mode) => {
        membersMode = mode === 'signup' ? 'signup' : 'login';
        clearInlineMessage();
        showMembersPhase('form');
        syncMembersModeUi();
    };

    showMembersPhase('choice');
    syncMembersModeUi();

    if (modeLoginBtn) modeLoginBtn.addEventListener('click', () => window.setMembersMode('login'));
    if (modeSignupBtn) modeSignupBtn.addEventListener('click', () => window.setMembersMode('signup'));
    if (backToChoiceBtn) {
        backToChoiceBtn.addEventListener('click', () => {
            clearInlineMessage();
            membersMode = 'login';
            showMembersPhase('choice');
            syncMembersModeUi();
        });
    }

    updateMembersEntitlementFromStoredState().catch(() => {
        renderMembersStatus(null);
    });

    processMembersUrlActions(showInlineMessage).catch(() => {});

    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const emailInput = document.getElementById('membersEmail');
        const nameInput = document.getElementById('membersName');
        const passwordInput = document.getElementById('membersPassword');
        const passwordConfirmInput = document.getElementById('membersPasswordConfirm');
        const email = (emailInput?.value || '').trim().toLowerCase();
        const name = (nameInput?.value || '').trim();
        const password = passwordInput?.value || '';
        const passwordConfirm = passwordConfirmInput?.value || '';
        if (!email || !password) {
            showInlineMessage('Enter both email and password.');
            showMessage('Enter both email and password.', 'error');
            return;
        }
        if (membersMode === 'signup' && password.length < 6) {
            showInlineMessage('Password must be at least 6 characters.');
            showMessage('Password must be at least 6 characters.', 'error');
            return;
        }
        if (membersMode === 'signup' && !email.includes('@')) {
            showInlineMessage('Enter a valid email address.');
            showMessage('Enter a valid email address.', 'error');
            return;
        }
        if (membersMode === 'signup' && password !== passwordConfirm) {
            showInlineMessage('Passwords do not match.');
            showMessage('Passwords do not match.', 'error');
            return;
        }
        clearInlineMessage();
        try {
            if (membersMode === 'signup') {
                const signupPayload = await authApiRequest('/auth/signup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password, name })
                });
                showInlineMessage('Account created. Check your email to verify your account before signing in.', 'success');
                showMessage('Account created. Check your email to verify your account before signing in.', 'success');
                if (passwordInput) passwordInput.value = '';
                if (passwordConfirmInput) passwordConfirmInput.value = '';
                if (nameInput) nameInput.value = '';
                // Never chain login in the same submit — new accounts are unverified until link or password-reset completes.
                if (signupPayload?.emailVerified !== true) {
                    return;
                }
            }
            const payload = await membersLogin(email, password);
            saveMembersState({
                email,
                accessToken: payload.accessToken,
                refreshToken: payload.refreshToken
            });
            // Keep members flow resilient even if entitlement endpoint is temporarily unavailable.
            try {
                await updateMembersEntitlementFromStoredState();
            } catch (_entitlementError) {
                renderMembersStatus({
                    email,
                    state: 'trial',
                    packageCode: 'Trial',
                    trialEndsAt: '-',
                    paidEndsAt: '-',
                    graceEndsAt: '-'
                });
            }
            showInlineMessage(membersMode === 'signup' ? 'Account created and signed in.' : 'Signed in successfully.', 'success');
            showMessage(membersMode === 'signup' ? 'Account created and signed in.' : 'Members login successful.', 'success');
            if (passwordInput) passwordInput.value = '';
            if (membersMode === 'signup' && nameInput) nameInput.value = '';
            if (passwordConfirmInput) passwordConfirmInput.value = '';
        } catch (error) {
            showInlineMessage(error.message || 'Members login failed.');
            showMessage(error.message || 'Members login failed.', 'error');
        }
    });

    if (forgotPasswordBtn) {
        forgotPasswordBtn.addEventListener('click', async function() {
            const emailInput = document.getElementById('membersEmail');
            const email = (emailInput?.value || '').trim().toLowerCase();
            if (!email || !email.includes('@')) {
                showInlineMessage('Enter your email first, then click Forgot password.');
                return;
            }
            try {
                await authApiRequest('/auth/request-password-reset', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                showInlineMessage('If this email exists, a reset link has been sent.', 'success');
            } catch (error) {
                showInlineMessage(error.message || 'Could not start password reset.');
            }
        });
    }

    if (resendVerifyBtn) {
        resendVerifyBtn.addEventListener('click', async function() {
            const emailInput = document.getElementById('membersEmail');
            const email = (emailInput?.value || '').trim().toLowerCase();
            if (!email || !email.includes('@')) {
                showInlineMessage('Enter your email first, then click Resend verification email.');
                return;
            }
            try {
                const payload = await authApiRequest('/auth/resend-verification', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                if (payload?.alreadyVerified) {
                    showInlineMessage('This account is already verified. You can sign in.', 'success');
                } else {
                    showInlineMessage('If this email is registered and needs verification, we sent a new message. Check junk mail.', 'success');
                }
            } catch (error) {
                showInlineMessage(error.message || 'Could not resend verification email.');
            }
        });
    }

    if (refreshBtn) {
        refreshBtn.addEventListener('click', async function() {
            try {
                await updateMembersEntitlementFromStoredState();
                showMessage('Status refreshed.', 'success');
            } catch (error) {
                showMessage(error.message || 'Could not refresh status.', 'error');
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            clearMembersState();
            renderMembersStatus(null);
            showMembersPhase('choice');
            clearInlineMessage();
            showMessage('Signed out from members area.', 'success');
        });
    }
}

function readMembersQueryParam(name) {
    const fromSearch = new URLSearchParams(window.location.search || '').get(name);
    if (fromSearch !== null && fromSearch !== '') return fromSearch;
    const hash = window.location.hash || '';
    const qm = hash.indexOf('?');
    if (qm >= 0) {
        const h = new URLSearchParams(hash.slice(qm + 1));
        const v = h.get(name);
        if (v !== null && v !== '') return v;
    }
    return null;
}

async function processMembersUrlActions(showInlineMessage) {
    const verified = readMembersQueryParam('verified');
    const verifyReason = readMembersQueryParam('reason');
    if (verified === '1') {
        if (typeof window.setMembersMode === 'function') window.setMembersMode('login');
        showInlineMessage('Email verified successfully. You can now sign in.', 'success');
        window.history.replaceState({}, '', `${window.location.pathname}#members`);
        return;
    }
    if (verified === '0') {
        if (typeof window.setMembersMode === 'function') window.setMembersMode('login');
        const msg = verifyReason
            ? `Verification issue: ${decodeURIComponent(verifyReason)}`
            : 'Email verification failed.';
        showInlineMessage(msg);
        window.history.replaceState({}, '', `${window.location.pathname}#members`);
        return;
    }
    const params = new URLSearchParams(window.location.search || '');
    const verifyToken = params.get('verify');
    const resetToken = params.get('reset');
    if (verifyToken) {
        if (typeof window.setMembersMode === 'function') window.setMembersMode('login');
        try {
            await authApiRequest('/auth/verify-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: verifyToken })
            });
            showInlineMessage('Email verified successfully. You can now sign in.', 'success');
        } catch (error) {
            showInlineMessage(error.message || 'Email verification failed.');
        }
        window.history.replaceState({}, '', `${window.location.pathname}#members`);
        return;
    }
    if (resetToken) {
        const newPassword = window.prompt('Enter your new password (minimum 6 characters):');
        if (!newPassword) return;
        const confirmPassword = window.prompt('Confirm your new password:');
        if (!confirmPassword) return;
        if (newPassword !== confirmPassword) {
            showInlineMessage('Passwords do not match.');
            if (typeof window.setMembersMode === 'function') window.setMembersMode('login');
            return;
        }
        if (typeof window.setMembersMode === 'function') window.setMembersMode('login');
        try {
            await authApiRequest('/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: resetToken, newPassword })
            });
            showInlineMessage('Password reset successful. Please sign in.', 'success');
        } catch (error) {
            showInlineMessage(error.message || 'Password reset failed.');
        }
        window.history.replaceState({}, '', `${window.location.pathname}#members`);
    }
}

async function authApiRequest(pathSuffix, options = {}) {
    const response = await authApiFetch(pathSuffix, options);
    const raw = await response.text();
    if (String(raw || '').trimStart().startsWith('<')) {
        throw new Error('Server returned HTML instead of JSON. Check your connection or try again.');
    }
    const payload = applyAuthTokenAliases(normalizeAuthApiEnvelope(parseAuthJsonResponse(raw)));
    if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || payload?.code || `Request failed (${response.status})`);
    }
    return payload;
}

// Card formatting functions no longer needed - PayPal handles card input

// Track Microsoft Store button click
function trackStoreClick() {
    // Google Analytics 4
    if (typeof gtag !== 'undefined') {
        gtag('event', 'microsoft_store_click', {
            'event_category': 'Download',
            'event_label': 'Microsoft Store Button',
            'value': 1
        });
    }
    
    // Meta Pixel
    if (typeof fbq !== 'undefined') {
        fbq('track', 'Lead', {
            content_name: 'Microsoft Store Click',
            content_category: 'Download'
        });
    }
    
    // Console log for debugging
    console.log('Microsoft Store button clicked - tracking event sent');
}

// Utility function to view stored data (for debugging)
function viewStoredData() {
    console.log('Customer Data:', JSON.parse(localStorage.getItem('customerData') || '{}'));
    console.log('Downloads:', JSON.parse(localStorage.getItem('downloads') || '[]'));
    console.log('Licenses:', JSON.parse(localStorage.getItem('licenses') || '[]'));
}

// Test email function (run in browser console: testEmailFunction())
function testEmailFunction() {
    console.log('🧪 Testing email function...');
    const testData = {
        action: 'trial_registration',
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        platform: 'macOS',
        company: 'Test Company',
        phone: '+1234567890',
        addressLine1: '123 Test St',
        city: 'Test City',
        country: 'Test Country',
        source: 'test'
    };
    
    fetch(EMAIL_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify(testData),
        mode: 'cors'
    })
    .then(async response => {
        console.log('Response status:', response.status);
        const text = await response.text();
        console.log('Response text:', text);
        try {
            const data = JSON.parse(text);
            console.log('Response data:', data);
            if (response.ok && data.ok) {
                console.log('✅ Email test successful!');
            } else {
                console.error('❌ Email test failed:', data.error || data);
            }
        } catch (e) {
            console.error('❌ Could not parse response:', e);
        }
    })
    .catch(error => {
        console.error('❌ Network error:', error);
    });
}

// Make test function available globally
window.testEmailFunction = testEmailFunction;