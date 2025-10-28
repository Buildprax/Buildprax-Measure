// BUILDPRAX MEASURE PRO - Complete Website JavaScript
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
});

// Registration Modal Functions
function showRegistrationModal() {
    document.getElementById('registrationModal').style.display = 'block';
}

function closeRegistrationModal() {
    document.getElementById('registrationModal').style.display = 'none';
}

// Payment Modal Functions
function showPaymentModal() {
    document.getElementById('paymentModal').style.display = 'block';
    initializePayPalButton();
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
            const formData = new FormData(this);
            const firstName = formData.get('firstName');
            const lastName = formData.get('lastName');
            const email = formData.get('email');
            const company = formData.get('company');
            const phone = formData.get('phone');
            const country = formData.get('country');
            const source = formData.get('source');
            
            // Validate required fields
            if (!firstName || !lastName || !email || !country) {
                showMessage('Please fill in all required fields.', 'error');
                return;
            }
            
            // Store customer data
            const customerData = {
                firstName: firstName,
                lastName: lastName,
                email: email,
                company: company || 'Not provided',
                phone: phone || 'Not provided',
                country: country,
                source: source || 'Not specified',
                timestamp: new Date().toISOString(),
                type: 'trial_registration'
            };
            
            // Store in localStorage
            const customers = JSON.parse(localStorage.getItem('customers') || '[]');
            customers.push(customerData);
            localStorage.setItem('customers', JSON.stringify(customers));
            
            // Submit to Formspree
            fetch('https://formspree.io/f/xblpgwzy', {
                method: 'POST',
                body: formData,
                headers: {
                    'Accept': 'application/json'
                }
            })
            .then(response => {
                if (response.ok) {
                    // Success - start download
                    startDownload();
                    closeRegistrationModal();
                    showMessage('Registration successful! Download starting...', 'success');
                } else {
                    throw new Error('Form submission failed');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                // Still start download even if form submission fails
                startDownload();
                closeRegistrationModal();
                showMessage('Registration successful! Download starting...', 'success');
            });
        });
    }
});

// Start Download Function
function startDownload() {
    const downloadLink = 'https://buildprax-downloads.sfo3.digitaloceanspaces.com/BUILDPRAX%20MEASURE%20PRO-1.0.0-arm64.dmg';
    
    // Create temporary download
    const link = document.createElement('a');
    link.href = downloadLink;
    link.download = 'BUILDPRAX MEASURE PRO-1.0.0-arm64.dmg';
    link.click();
    
    // Track download
    const downloads = JSON.parse(localStorage.getItem('downloads') || '[]');
    downloads.push({
        timestamp: new Date().toISOString(),
        type: 'trial_download',
        source: 'registration_form'
    });
    localStorage.setItem('downloads', JSON.stringify(downloads));
}

// Payment Method Selection
function selectPaymentMethod(method) {
    const cardFields = document.getElementById('cardFields');
    const paypalFields = document.getElementById('paypalFields');
    const cardPayment = document.getElementById('cardPayment');
    const paypalPayment = document.getElementById('paypalPayment');
    
    if (method === 'card') {
        cardPayment.checked = true;
        cardFields.style.display = 'block';
        paypalFields.style.display = 'none';
    } else if (method === 'paypal') {
        paypalPayment.checked = true;
        cardFields.style.display = 'none';
        paypalFields.style.display = 'block';
        initializePayPalButton();
    }
}

// PayPal Button Initialization
function initializePayPalButton() {
    const container = document.getElementById('paypal-button-container');
    container.innerHTML = '';
    
    paypal.Buttons({
        createOrder: function(data, actions) {
            return actions.order.create({
                purchase_units: [{
                    amount: {
                        value: '299.00',
                        currency_code: 'USD'
                    },
                    description: 'BUILDPRAX MEASURE PRO - Pro License (1 Year)'
                }]
            });
        },
        onApprove: function(data, actions) {
            return actions.order.capture().then(function(details) {
                // Payment successful
                console.log('Payment completed:', details);
                
                // Generate and send license key
                sendLicenseKey(details);
                
                // Close modal
                closePaymentModal();
                
                // Show success message
                showMessage('Payment successful! Your license key has been sent to your email.', 'success');
            });
        },
        onError: function(err) {
            console.error('PayPal error:', err);
            showMessage('Payment failed. Please try again.', 'error');
        }
    }).render('#paypal-button-container');
}

// Payment Form Handler
document.addEventListener('DOMContentLoaded', function() {
    const paymentForm = document.getElementById('paymentForm');
    if (paymentForm) {
        paymentForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked').value;
            
            if (paymentMethod === 'card') {
                // Handle card payment
                handleCardPayment();
            } else if (paymentMethod === 'paypal') {
                // PayPal is handled by the PayPal button
                showMessage('Please use the PayPal button below to complete your payment.', 'error');
            }
        });
    }
});

// Handle Card Payment
function handleCardPayment() {
    const cardNumber = document.getElementById('cardNumber').value;
    const expiryDate = document.getElementById('expiryDate').value;
    const cvv = document.getElementById('cvv').value;
    const cardName = document.getElementById('cardName').value;
    
    // Basic validation
    if (!cardNumber || !expiryDate || !cvv || !cardName) {
        showMessage('Please fill in all card details.', 'error');
        return;
    }
    
    // For demo purposes, simulate successful payment
    // In production, you would integrate with a payment processor
    showMessage('Processing payment...', 'success');
    
    setTimeout(() => {
        // Simulate successful payment
        const mockPaymentDetails = {
            id: 'PAY-' + Math.random().toString(36).substr(2, 9),
            status: 'COMPLETED',
            amount: '299.00',
            currency: 'USD'
        };
        
        sendLicenseKey(mockPaymentDetails);
        closePaymentModal();
        showMessage('Payment successful! Your license key has been sent to your email.', 'success');
    }, 2000);
}

// Send License Key Function
function sendLicenseKey(paymentDetails) {
    // Generate license key
    const licenseKey = generateLicenseKey();
    
    // Get customer email from localStorage
    const customers = JSON.parse(localStorage.getItem('customers') || '[]');
    const latestCustomer = customers[customers.length - 1];
    const customerEmail = latestCustomer ? latestCustomer.email : 'customer@example.com';
    
    // In a real implementation, this would send an email
    console.log('Sending license key to:', customerEmail);
    console.log('License key:', licenseKey);
    
    // Track payment
    trackPayment(customerEmail, paymentDetails, licenseKey);
    
    // Store license key
    const licenses = JSON.parse(localStorage.getItem('licenses') || '[]');
    licenses.push({
        email: customerEmail,
        licenseKey: licenseKey,
        timestamp: new Date().toISOString(),
        paymentId: paymentDetails.id,
        amount: '299.00',
        status: 'active'
    });
    localStorage.setItem('licenses', JSON.stringify(licenses));
    
    // Send to Formspree for email notification
    const licenseData = new FormData();
    licenseData.append('formType', 'license_key_delivery');
    licenseData.append('customerEmail', customerEmail);
    licenseData.append('licenseKey', licenseKey);
    licenseData.append('paymentId', paymentDetails.id);
    licenseData.append('amount', '299.00');
    
    fetch('https://formspree.io/f/xblpgwzy', {
        method: 'POST',
        body: licenseData,
        headers: {
            'Accept': 'application/json'
        }
    })
    .then(response => {
        if (response.ok) {
            console.log('License key notification sent successfully');
        } else {
            console.error('Failed to send license key notification');
        }
    })
    .catch(error => {
        console.error('Error sending license key notification:', error);
    });
}

// Generate License Key Function
function generateLicenseKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 16; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
        if (i === 3 || i === 7 || i === 11) {
            result += '-';
        }
    }
    return result;
}

// Track Payment Function
function trackPayment(email, paymentDetails, licenseKey) {
    console.log('Payment tracked for:', email);
    console.log('Payment details:', paymentDetails);
    console.log('License key generated:', licenseKey);
    
    // Store in localStorage
    const payments = JSON.parse(localStorage.getItem('payments') || '[]');
    payments.push({
        email: email,
        timestamp: new Date().toISOString(),
        type: 'pro_license',
        amount: '299.00',
        paymentId: paymentDetails.id,
        licenseKey: licenseKey,
        status: 'completed'
    });
    localStorage.setItem('payments', JSON.stringify(payments));
}

// Show Message Function
function showMessage(text, type) {
    // Remove existing messages
    const existingMessages = document.querySelectorAll('.message');
    existingMessages.forEach(msg => msg.remove());
    
    // Create new message
    const message = document.createElement('div');
    message.className = `message ${type}`;
    message.textContent = text;
    
    // Insert at top of body
    document.body.insertBefore(message, document.body.firstChild);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        message.remove();
    }, 5000);
}

// Utility function to view stored data (for debugging)
function viewStoredData() {
    console.log('Customers:', JSON.parse(localStorage.getItem('customers') || '[]'));
    console.log('Downloads:', JSON.parse(localStorage.getItem('downloads') || '[]'));
    console.log('Payments:', JSON.parse(localStorage.getItem('payments') || '[]'));
    console.log('Licenses:', JSON.parse(localStorage.getItem('licenses') || '[]'));
}

// Form validation helpers
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function validateCardNumber(cardNumber) {
    // Remove spaces and check if it's a valid card number
    const cleaned = cardNumber.replace(/\s/g, '');
    return /^\d{13,19}$/.test(cleaned);
}

function formatCardNumber(input) {
    let value = input.value.replace(/\s/g, '');
    let formattedValue = value.replace(/(.{4})/g, '$1 ').trim();
    input.value = formattedValue;
}

// Add card number formatting
document.addEventListener('DOMContentLoaded', function() {
    const cardNumberInput = document.getElementById('cardNumber');
    if (cardNumberInput) {
        cardNumberInput.addEventListener('input', function() {
            formatCardNumber(this);
        });
    }
    
    // Add expiry date formatting
    const expiryInput = document.getElementById('expiryDate');
    if (expiryInput) {
        expiryInput.addEventListener('input', function() {
            let value = this.value.replace(/\D/g, '');
            if (value.length >= 2) {
                value = value.substring(0, 2) + '/' + value.substring(2, 4);
            }
            this.value = value;
        });
    }
});
