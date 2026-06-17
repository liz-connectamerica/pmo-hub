var ALL_PEOPLE = ['Alex Turner','Mia Nguyen','Jordan Lee','Sam Park','Casey Morgan','Robin Chen','Dana Wu','Chris Bell'];
var ALL_TEAMS  = ['Platform Team','Design Guild','QA Team','Data Team'];
var VALUE_AREAS = ['Revenue Growth','Customer Experience','Operational Efficiency','Employee Experience','Compliance & Risk'];
var PHASES = ['Not Started','Discovery','Design','Build','Testing','Deployment'];
var STATUSES = ['Not Started','On Track','At Risk','Planning','Blocked','Complete'];
var PRIORITIES = ['Critical','High','Medium','Low'];
var AV_COLS = ['av-purple','av-teal','av-blue','av-coral','av-amber'];

var D = {
  role: 'admin',
  notifications: [],

  requests: [
    { id:'r1', title:'Customer Portal Redesign', submitter:'Sarah Chen', dept:'Marketing', date:'2025-06-01', status:'Approved', priority:'High', value:'Customer Experience', impact:'Reduce support tickets 30%, improve NPS score', description:'Our current portal is outdated and causing friction. Redesigning it will reduce support load and increase self-service adoption.', effort:'L', cost:45000, feedback:'Approved — high strategic value. Ready for scheduling.', linkedProject:'p2' },
    { id:'r2', title:'Inventory Management System', submitter:'Tom Walsh', dept:'Operations', date:'2025-06-05', status:'Active', priority:'Critical', value:'Operational Efficiency', impact:'Eliminate $200k in annual overstocking costs', description:'Manual inventory tracking is error-prone and costly. An automated system will save time and reduce waste.', effort:'XL', cost:120000, feedback:'Approved — high ROI. Scheduled Q3.', linkedProject:'p1' },
    { id:'r3', title:'HR Onboarding Automation', submitter:'Priya Patel', dept:'HR', date:'2025-06-08', status:'Backlog', priority:'Medium', value:'Employee Experience', impact:'Cut onboarding time from 2 weeks to 3 days', description:'New hire onboarding involves 40+ manual steps across 6 systems. Automation will save PM time.', effort:'M', cost:28000, feedback:'Approved — in backlog, will be scheduled soon.', linkedProject:'p3' },
    { id:'r4', title:'Sales Analytics Dashboard', submitter:'Marco Rivera', dept:'Sales', date:'2025-06-10', status:'Rejected', priority:'Low', value:'Revenue Growth', impact:'Better visibility into pipeline health', description:'Sales team needs a consolidated view of pipeline data from Salesforce and HubSpot.', effort:'S', cost:12000, feedback:'Rejected — existing HubSpot dashboards cover this. Please review existing tooling first.' },
    { id:'r5', title:'Mobile App v2.0', submitter:'Jess Kim', dept:'Product', date:'2025-06-12', status:'Pending', priority:'High', value:'Revenue Growth', impact:'Projected 25% increase in mobile conversions', description:'Current mobile app has poor ratings and key features are missing. v2.0 will close the feature gap.', effort:'XL', cost:200000, feedback:'' },
    { id:'r6', title:'Data Warehouse Migration', submitter:'Dana Wu', dept:'Technology', date:'2025-06-15', status:'Pending', priority:'High', value:'Operational Efficiency', impact:'Reduce BI report generation time from hours to minutes', description:'Legacy data warehouse is slow and expensive to maintain.', effort:'XL', cost:90000, feedback:'' }
  ],

  projects: [
    { id:'p1', name:'Inventory Management System', pm:'Alex Turner', team:['Alex Turner','Mia Nguyen','Jordan Lee'], status:'On Track', phase:'Build', progress:45, start:'2025-04-01', end:'2025-09-30', value:'Operational Efficiency', priority:'Critical', description:'End-to-end inventory tracking and forecasting system replacing manual spreadsheet processes.', blockers:'Vendor API docs delayed by 1 week', health:'green', stage:'active', plannedStart:'2025-04-01', requestId:'r2',
      milestones:[{name:'Discovery complete',date:'2025-04-30',done:true},{name:'Design approved',date:'2025-05-31',done:true},{name:'Alpha build',date:'2025-07-31',done:false},{name:'UAT',date:'2025-09-01',done:false},{name:'Go-live',date:'2025-09-30',done:false}],
      tasks:[{id:'t1',title:'API integration spec',assignee:'Mia Nguyen',status:'Done',due:'2025-05-20'},{id:'t2',title:'DB schema design',assignee:'Jordan Lee',status:'Done',due:'2025-05-25'},{id:'t3',title:'Backend endpoints',assignee:'Jordan Lee',status:'In Progress',due:'2025-07-01'},{id:'t4',title:'Frontend build',assignee:'Mia Nguyen',status:'To Do',due:'2025-08-01'},{id:'t5',title:'Testing suite',assignee:'Alex Turner',status:'To Do',due:'2025-09-01'}],
      raid:{risks:[{id:'ri1',desc:'Vendor API delays could push delivery',severity:'High',owner:'Alex Turner',mitigation:'Weekly check-ins with vendor; escalation path defined if slip exceeds 2 weeks'}],assumptions:[{id:'a1',desc:'Warehouse team available for UAT in Sept',owner:'Mia Nguyen'}],issues:[{id:'i1',desc:'Dev environment config mismatch',severity:'Medium',owner:'Jordan Lee',status:'Open'}],dependencies:[{id:'d1',desc:'Salesforce integration requires IT approval',owner:'Alex Turner',status:'Pending'}]}
    },
    { id:'p2', name:'Customer Portal Redesign', pm:'Mia Nguyen', team:['Mia Nguyen','Sam Park'], status:'At Risk', phase:'Design', progress:20, start:'2025-06-01', end:'2025-11-30', value:'Customer Experience', priority:'High', description:'Full redesign of the customer self-service portal to reduce friction and support load.', blockers:'Design agency contract not yet signed', health:'amber', stage:'active', plannedStart:'2025-06-01', requestId:'r1',
      milestones:[{name:'Discovery complete',date:'2025-06-30',done:true},{name:'Wireframes approved',date:'2025-07-31',done:false},{name:'Dev handoff',date:'2025-09-01',done:false},{name:'Beta launch',date:'2025-11-01',done:false},{name:'Go-live',date:'2025-11-30',done:false}],
      tasks:[{id:'t6',title:'Stakeholder interviews',assignee:'Mia Nguyen',status:'Done',due:'2025-06-20'},{id:'t7',title:'User journey mapping',assignee:'Sam Park',status:'In Progress',due:'2025-07-10'},{id:'t8',title:'Wireframes',assignee:'Sam Park',status:'To Do',due:'2025-07-25'}],
      raid:{risks:[{id:'ri2',desc:'Agency delay may push wireframe timeline',severity:'High',owner:'Mia Nguyen',mitigation:'Identify backup agency; shortlist two alternatives by end of June'}],assumptions:[{id:'a2',desc:'Budget of $45k approved by finance'}],issues:[{id:'i2',desc:'Contract signature pending legal review',severity:'High',owner:'Mia Nguyen',status:'Open'}],dependencies:[{id:'d2',desc:'Requires UX research from Marketing team',owner:'Sam Park',status:'Active'}]}
    },
    { id:'p3', name:'HR Onboarding Automation', pm:'', team:[], status:'Not Started', phase:'Not Started', progress:0, start:'', end:'2025-10-31', value:'Employee Experience', priority:'Medium', description:'Automate the 40-step new hire onboarding process across 6 systems.', blockers:'', health:'green', stage:'backlog', plannedStart:'', requestId:'r3',
      milestones:[{name:'Process mapping',date:'2025-07-31',done:false},{name:'Tool selection',date:'2025-08-15',done:false},{name:'Build complete',date:'2025-10-01',done:false},{name:'Go-live',date:'2025-10-31',done:false}],
      tasks:[],
      raid:{risks:[],assumptions:[{id:'a3',desc:'HR team can dedicate 4hrs/week to project'}],issues:[],dependencies:[{id:'d3',desc:'Requires IT to provision sandbox HRIS environment',owner:'TBD',status:'Pending'}]}
    }
  ],

  resources: [
    { id:'res1', name:'Alex Turner',  type:'individual', role:'Engineering Lead',     allocated:85,  projects:['p1'], nonProjectCapacity:10 },
    { id:'res2', name:'Mia Nguyen',   type:'individual', role:'Full Stack Dev',        allocated:100, projects:['p1','p2'], nonProjectCapacity:10 },
    { id:'res3', name:'Jordan Lee',   type:'individual', role:'Backend Dev',           allocated:70,  projects:['p1'], nonProjectCapacity:15 },
    { id:'res4', name:'Sam Park',     type:'individual', role:'UX / Product',          allocated:90,  projects:['p2'], nonProjectCapacity:10 },
    { id:'res5', name:'Casey Morgan', type:'individual', role:'Business Analyst',      allocated:30,  projects:[], nonProjectCapacity:20 },
    { id:'res6', name:'Robin Chen',   type:'individual', role:'Researcher',            allocated:20,  projects:[], nonProjectCapacity:10 },
    { id:'res7', name:'Platform Team',type:'team',       role:'DevOps & Infra',        allocated:55,  projects:['p1'], members:['Jordan Lee','Chris Bell'], nonProjectCapacity:0 },
    { id:'res8', name:'Design Guild', type:'team',       role:'UX Research & Design',  allocated:80,  projects:['p2'], members:['Sam Park','Robin Chen'], nonProjectCapacity:0 }
  ]
};
