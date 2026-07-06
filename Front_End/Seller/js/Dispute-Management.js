
    // ===== DUMMY DATA =====
    const dummyDisputes = [
      {
        id: 'DSP-001',
        type: 'Return issue',
        orderId: 'ORD-1001',
        dateRaised: '2025-11-25',
        dateOrdered: '2025-11-20',
        status: 'Pending',
        amount: 89.99,
        description: 'Customer refuses to accept the returned item. Says the item was damaged on arrival.',
        evidence: ['https://via.placeholder.com/120?text=Photo+1', 'https://via.placeholder.com/120?text=Photo+2'],
        reviewer: 'Admin - John Smith',
        timeline: ['Raised'],
        adminDecision: null
      },
      {
        id: 'DSP-002',
        type: 'Payment issue',
        orderId: 'ORD-1002',
        dateRaised: '2025-11-24',
        dateOrdered: '2025-11-18',
        status: 'Under Review',
        amount: 45.50,
        description: 'Customer charged twice for the same order. Request for refund of duplicate payment.',
        evidence: ['https://via.placeholder.com/120?text=Receipt'],
        reviewer: 'Admin - Sarah Lee',
        timeline: ['Raised', 'Under Review'],
        adminDecision: null
      },
      {
        id: 'DSP-003',
        type: 'Policy issue',
        orderId: 'ORD-1003',
        dateRaised: '2025-11-22',
        dateOrdered: '2025-11-10',
        status: 'Resolved',
        amount: 120.00,
        description: 'Seller violated return policy by refusing to accept return request after 15 days.',
        evidence: [],
        reviewer: 'Admin - Mike Johnson',
        timeline: ['Raised', 'Under Review', 'Resolved'],
        adminDecision: {
          decision: 'Approved',
          comments: 'Return period was still valid. Seller must accept return.',
          compensation: 120.00,
          date: '2025-11-24'
        }
      },
      {
        id: 'DSP-004',
        type: 'Other',
        orderId: 'ORD-1004',
        dateRaised: '2025-11-21',
        dateOrdered: '2025-11-15',
        status: 'Rejected',
        amount: 34.99,
        description: 'Customer complaint about slow delivery. But tracking shows delivery on time.',
        evidence: [],
        reviewer: 'Admin - Emma Davis',
        timeline: ['Raised', 'Under Review', 'Resolved'],
        adminDecision: {
          decision: 'Rejected',
          comments: 'No valid reason found. Order delivered within promised timeframe.',
          compensation: 0,
          date: '2025-11-23'
        }
      },
      {
        id: 'DSP-005',
        type: 'Return issue',
        orderId: 'ORD-1005',
        dateRaised: '2025-11-20',
        dateOrdered: '2025-11-12',
        status: 'Resolved',
        amount: 79.99,
        description: 'Wrong item sent to customer. Item received was not matching the order.',
        evidence: ['https://via.placeholder.com/120?text=Wrong+Item'],
        reviewer: 'Admin - John Smith',
        timeline: ['Raised', 'Under Review', 'Resolved'],
        adminDecision: {
          decision: 'Approved',
          comments: 'Clear error on seller side. Full refund approved.',
          compensation: 79.99,
          date: '2025-11-22'
        }
      },
      {
        id: 'DSP-006',
        type: 'Payment issue',
        orderId: 'ORD-1006',
        dateRaised: '2025-11-19',
        dateOrdered: '2025-11-14',
        status: 'Under Review',
        amount: 55.75,
        description: 'Payment gateway error. Money deducted but order not placed. Need to process order.',
        evidence: ['https://via.placeholder.com/120?text=Bank+Slip'],
        reviewer: 'Admin - Sarah Lee',
        timeline: ['Raised', 'Under Review'],
        adminDecision: null
      }
    ];

    const dummyNotifications = [
      { type: 'alert', title: 'Admin Requested Evidence', text: 'Admin has requested additional evidence for dispute DSP-002. Please upload within 48 hours.' },
      { type: 'success', title: 'Dispute Resolved', text: 'Dispute DSP-003 has been resolved. Full compensation of $120.00 approved.' },
      { type: 'info', title: 'Dispute Escalated', text: 'Dispute DSP-001 has been escalated to senior admin for final decision.' },
      { type: 'alert', title: 'Action Required', text: 'Dispute DSP-005 resolved with compensation. Please process refund within 48 hours.' },
      { type: 'success', title: 'Dispute Created', text: 'Your new dispute DSP-006 has been created and assigned to an admin reviewer.' },
      { type: 'info', title: 'Status Update', text: 'Dispute DSP-004 status changed to Rejected. You can view the decision in dispute details.' }
    ];

    // ===== STATE =====
    let disputes = JSON.parse(JSON.stringify(dummyDisputes));
    let filteredDisputes = [...disputes];
    let currentPage = 1;
    const itemsPerPage = 10;
    let currentDisputeDetail = null;
    let uploadedFiles = [];

    // ===== DOM ELEMENTS =====
    // Note: Sidebar is now handled by the new header/sidebar in HTML
    // const sidebar = document.querySelector('.sidebar');
    // const toggleBtn = document.getElementById('toggleBtn');
    // const closeBtn = document.getElementById('closeBtn');
    // const overlay = document.getElementById('overlay');
    const detailModal = document.getElementById('detailModal');
    const modalClose = document.getElementById('modalClose');
    const raiseDisputeModal = document.getElementById('raiseDisputeModal');
    const raiseModalClose = document.getElementById('raiseModalClose');

    // ===== SIDEBAR TOGGLE =====
    // Sidebar functionality removed - handled by new header/sidebar structure
    /*
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.add('active');
      overlay.classList.add('active');
    });

    closeBtn.addEventListener('click', () => {
      sidebar.classList.remove('active');
      overlay.classList.remove('active');
    });

    overlay.addEventListener('click', () => {
      sidebar.classList.remove('active');
      overlay.classList.remove('active');
      if (detailModal.classList.contains('active')) {
        detailModal.classList.remove('active');
      }
      if (raiseDisputeModal.classList.contains('active')) {
        raiseDisputeModal.classList.remove('active');
      }
    });
    */

    modalClose.addEventListener('click', () => {
      detailModal.classList.remove('active');
    });

    raiseModalClose.addEventListener('click', () => {
      raiseDisputeModal.classList.remove('active');
    });

    // ===== OPEN RAISE DISPUTE MODAL =====
    function openRaiseDisputeModal() {
      raiseDisputeModal.classList.add('active');
    }

    // ===== TAB SWITCHING =====
    function switchTab(tabName) {
      const tabs = document.querySelectorAll('.tab-content');
      const btns = document.querySelectorAll('.tab-btn');

      tabs.forEach(tab => tab.classList.remove('active'));
      btns.forEach(btn => btn.classList.remove('active'));

      document.getElementById(tabName + '-tab').classList.add('active');
      event.target.classList.add('active');
    }

    // ===== SEARCH & FILTER =====
    function applyFilters() {
      const searchTerm = document.getElementById('searchInput').value.toLowerCase();
      const typeTerm = document.getElementById('typeFilter').value;
      const statusTerm = document.getElementById('statusFilter').value;

      filteredDisputes = disputes.filter(d => {
        const matchSearch = 
          d.id.toLowerCase().includes(searchTerm) ||
          d.orderId.toLowerCase().includes(searchTerm);
        
        const matchType = typeTerm === '' || d.type === typeTerm;
        const matchStatus = statusTerm === '' || d.status === statusTerm;

        return matchSearch && matchType && matchStatus;
      });

      currentPage = 1;
      renderDisputesTable();
      updateSummary();
    }

    document.getElementById('searchInput').addEventListener('input', applyFilters);
    document.getElementById('typeFilter').addEventListener('change', applyFilters);
    document.getElementById('statusFilter').addEventListener('change', applyFilters);

    // ===== RENDER TABLE =====
    function renderDisputesTable() {
      const tbody = document.getElementById('disputesTableBody');
      tbody.innerHTML = '';
      const start = (currentPage - 1) * itemsPerPage;
      const end = start + itemsPerPage;
      const pageData = filteredDisputes.slice(start, end);

      if (pageData.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" style="text-align: center; padding: 40px; color: #999;">
              No disputes found
            </td>
          </tr>
        `;
        renderPagination();
        return;
      }

      pageData.forEach(d => {
        const statusClass = `badge-${d.status.toLowerCase().replace(' ', '-')}`;
        const row = document.createElement('tr');
        row.innerHTML = `
          <td><span class="dispute-id">${d.id}</span></td>
          <td><span class="type-badge">${d.type}</span></td>
          <td>${d.orderId}</td>
          <td>${d.dateRaised}</td>
          <td><span class="status-badge ${statusClass}">${d.status}</span></td>
          <td>${d.adminDecision ? d.adminDecision.decision : 'Pending'}</td>
          <td><button class="btn-view" onclick="viewDisputeDetail('${d.id}')">View</button></td>
        `;
        tbody.appendChild(row);
      });

      renderPagination();
    }

    // ===== PAGINATION =====
    function renderPagination() {
      const paginationDiv = document.getElementById('disputesPagination');
      paginationDiv.innerHTML = '';
      const totalPages = Math.ceil(filteredDisputes.length / itemsPerPage);

      const prevBtn = document.createElement('button');
      prevBtn.textContent = 'Prev';
      prevBtn.disabled = currentPage === 1;
      prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
          currentPage--;
          renderDisputesTable();
        }
      });
      paginationDiv.appendChild(prevBtn);

      for (let i = 1; i <= totalPages; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.textContent = i;
        pageBtn.className = i === currentPage ? 'active' : '';
        pageBtn.addEventListener('click', () => {
          currentPage = i;
          renderDisputesTable();
        });
        paginationDiv.appendChild(pageBtn);
      }

      const nextBtn = document.createElement('button');
      nextBtn.textContent = 'Next';
      nextBtn.disabled = currentPage === totalPages;
      nextBtn.addEventListener('click', () => {
        if (currentPage < totalPages) {
          currentPage++;
          renderDisputesTable();
        }
      });
      paginationDiv.appendChild(nextBtn);
    }

    // ===== VIEW DETAIL =====
    function viewDisputeDetail(disputeId) {
      currentDisputeDetail = disputes.find(d => d.id === disputeId);
      if (!currentDisputeDetail) return;

      // Populate modal
      document.getElementById('modalTitle').textContent = `Dispute Details - ${currentDisputeDetail.id}`;
      document.getElementById('detailDisputeId').textContent = currentDisputeDetail.id;
      document.getElementById('detailType').textContent = currentDisputeDetail.type;
      document.getElementById('detailDateRaised').textContent = currentDisputeDetail.dateRaised;
      document.getElementById('detailStatus').innerHTML = `<span class="status-badge badge-${currentDisputeDetail.status.toLowerCase().replace(' ', '-')}">${currentDisputeDetail.status}</span>`;
      document.getElementById('detailOrderId').textContent = currentDisputeDetail.orderId;
      document.getElementById('detailAmount').textContent = `$${currentDisputeDetail.amount.toFixed(2)}`;
      document.getElementById('detailDateOrdered').textContent = currentDisputeDetail.dateOrdered;
      document.getElementById('detailReviewer').textContent = currentDisputeDetail.reviewer;
      document.getElementById('detailDescription').textContent = currentDisputeDetail.description;

      // Evidence
      const evidenceDiv = document.getElementById('detailEvidence');
      evidenceDiv.innerHTML = '';
      if (currentDisputeDetail.evidence.length > 0) {
        currentDisputeDetail.evidence.forEach(img => {
          const item = document.createElement('div');
          item.className = 'evidence-item';
          item.innerHTML = `<img src="${img}" alt="evidence">`;
          evidenceDiv.appendChild(item);
        });
      } else {
        evidenceDiv.innerHTML = '<p style="color: #999;">No evidence uploaded</p>';
      }

      // Timeline
      renderDisputeTimeline();

      // Admin Decision
      const decisionBox = document.getElementById('adminDecisionBox');
      if (currentDisputeDetail.adminDecision) {
        decisionBox.style.display = 'block';
        document.getElementById('adminDecision').textContent = currentDisputeDetail.adminDecision.decision;
        document.getElementById('adminComments').textContent = currentDisputeDetail.adminDecision.comments;
        document.getElementById('adminCompensation').textContent = `$${currentDisputeDetail.adminDecision.compensation.toFixed(2)}`;
        document.getElementById('adminDecisionDate').textContent = currentDisputeDetail.adminDecision.date;
      } else {
        decisionBox.style.display = 'none';
      }

      detailModal.classList.add('active');
    }

    // ===== TIMELINE RENDER =====
    function renderDisputeTimeline() {
      const timelineDiv = document.getElementById('detailTimeline');
      timelineDiv.innerHTML = '';

      const steps = [
        { label: 'Dispute Raised', key: 'Raised' },
        { label: 'Under Review', key: 'Under Review' },
        { label: 'Decision Made', key: 'Resolved' }
      ];

      steps.forEach((step, idx) => {
        const isCompleted = currentDisputeDetail.timeline.includes(step.key);

        const timelineItem = document.createElement('div');
        timelineItem.className = `timeline-item`;

        const dot = document.createElement('div');
        dot.className = `timeline-dot ${isCompleted ? 'completed' : ''}`;
        timelineItem.appendChild(dot);

        const content = document.createElement('div');
        content.className = 'timeline-content';
        content.innerHTML = `
          <h4>${step.label}</h4>
          <p>${isCompleted ? 'Completed' : 'Pending'}</p>
        `;
        timelineItem.appendChild(content);

        timelineDiv.appendChild(timelineItem);
      });
    }

    // ===== FILE UPLOAD =====
    const fileUploadArea = document.getElementById('fileUploadArea');
    const fileInput = document.getElementById('fileInput');
    const filePreview = document.getElementById('filePreview');

    fileUploadArea.addEventListener('click', () => fileInput.click());
    fileUploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      fileUploadArea.classList.add('dragover');
    });
    fileUploadArea.addEventListener('dragleave', () => {
      fileUploadArea.classList.remove('dragover');
    });
    fileUploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      fileUploadArea.classList.remove('dragover');
      handleFiles(e.dataTransfer.files);
    });

    fileInput.addEventListener('change', (e) => {
      handleFiles(e.target.files);
    });

    function handleFiles(files) {
      uploadedFiles = Array.from(files).slice(0, 5); // Max 5 files
      filePreview.innerHTML = '';

      uploadedFiles.forEach((file, idx) => {
        const item = document.createElement('div');
        item.className = 'file-item';

        if (file.type.startsWith('image')) {
          const reader = new FileReader();
          reader.onload = (e) => {
            item.innerHTML = `
              <img src="${e.target.result}" alt="preview">
              <button type="button" class="remove-btn" onclick="removeFile(${idx})">×</button>
            `;
          };
          reader.readAsDataURL(file);
        } else {
          item.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; height: 100%; background: #f5f5f5;">
              <span class="material-symbols-rounded" style="font-size: 48px; color: #999;">description</span>
            </div>
            <button type="button" class="remove-btn" onclick="removeFile(${idx})">×</button>
          `;
        }

        filePreview.appendChild(item);
      });
    }

    function removeFile(idx) {
      uploadedFiles.splice(idx, 1);
      handleFiles(uploadedFiles);
    }

    // ===== SUBMIT DISPUTE FORM =====
    function submitDisputeForm(e) {
      e.preventDefault();

      const type = document.getElementById('disputeType').value;
      const orderId = document.getElementById('orderId').value;
      const description = document.getElementById('description').value;

      if (!type || !orderId || !description) {
        alert('Please fill all required fields');
        return;
      }

      const newDispute = {
        id: `DSP-${String(disputes.length + 1).padStart(3, '0')}`,
        type,
        orderId,
        dateRaised: new Date().toISOString().split('T')[0],
        dateOrdered: '2025-11-20',
        status: 'Pending',
        amount: Math.random() * 100 + 20,
        description,
        evidence: [],
        reviewer: 'Pending Assignment',
        timeline: ['Raised'],
        adminDecision: null
      };

      disputes.push(newDispute);
      filteredDisputes = [...disputes];
      
      alert(`Dispute ${newDispute.id} created successfully!`);
      document.getElementById('raiseDisputeForm').reset();
      filePreview.innerHTML = '';
      uploadedFiles = [];
      updateSummary();
      raiseDisputeModal.classList.remove('active');
      renderDisputesTable();
    }

    // ===== SUMMARY =====
    function updateSummary() {
      const total = disputes.length;
      const pending = disputes.filter(d => d.status === 'Pending').length;
      const resolved = disputes.filter(d => d.status === 'Resolved').length;
      const rejected = disputes.filter(d => d.status === 'Rejected').length;

      document.getElementById('totalDisputes').textContent = total;
      document.getElementById('pendingDisputes').textContent = pending;
      document.getElementById('resolvedDisputes').textContent = resolved;
      document.getElementById('rejectedDisputes').textContent = rejected;
    }

    // ===== INIT =====
    renderDisputesTable();
    updateSummary();
