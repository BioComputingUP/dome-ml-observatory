import { Component, OnInit } from '@angular/core';
import { HttpClient, HttpClientModule } from '@angular/common/http'; // Import HttpClientModule
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms'; // Import FormsModule
import * as yaml from 'js-yaml'; // Import js-yaml

interface RegistryItem {
  name: string | null;
  description: string | null;
  url: string | null;
  'biotools-url': string | null;
  'fairsharing-url': string | null;
  'osai-recommendation': string | null;
  'osai-explanation': string | null;
  id: string | null;
  type: string | null; // Added type
  'access-model': string | null; // Added access-model
}

interface RecommendationOption {
  value: string;
  displayName: string;
}

@Component({
  selector: 'app-ai-ecosystem',
  templateUrl: './ai_ecosystem.html',
  styleUrls: ['./ai_ecosystem.component.css'] // Added styleUrls
})
export class AiEcosystemComponent implements OnInit {
  
  searchTerm: string = '';
  selectedType: string = 'All'; // Added for Type filter
  selectedRecommendation: string = 'All'; 
  selectedAccessModel: string = 'All'; // Added for Access Model filter
  
  originalData: RegistryItem[] = []; 
  filteredData: RegistryItem[] = []; 
  paginatedData: RegistryItem[] = []; // Data for the current page

  currentPage: number = 1;
  itemsPerPage: number = 10; // Number of items per page
  
  availableTypes: string[] = ['All']; // Added for Type filter
  availableAccessModels: string[] = ['All']; // Added for Access Model filter
  
  availableRecommendations: RecommendationOption[] = [
    { value: 'All', displayName: 'All' },
    { value: 'R1', displayName: 'R1 - Metadata' }, // Sample change
    { value: 'R2', displayName: 'R2 - Registries' },
    { value: 'R3', displayName: 'R3 - Training' },
    { value: 'R4', displayName: 'R4 - Disclosure' },
    { value: 'R5', displayName: 'R5 - Portability' },
    { value: 'R6', displayName: 'R6 - Standardisation' },
    { value: 'R7', displayName: 'R7 - Technique' },
    { value: 'R8', displayName: 'R8 - Hardware' },
    { value: 'R9', displayName: 'R9 - Impact' }
  ];

  isLoading: boolean = true;
  errorLoading: boolean = false;
  showRecommendations: boolean = false;

  // Inject data service if needed
  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    // Removed redirect logic - allow normal navigation to ai-ecosystem page
    // The redirect was preventing the navbar from working properly
    this.loadData(); // Load data when the component initializes
  }

  toggleRecommendations(): void {
    this.showRecommendations = !this.showRecommendations;
  }

  loadData(): void {
    this.isLoading = true;
    this.errorLoading = false;
    
    this.http.get('assets/ecosystem_components_list.yml', { responseType: 'text' })
      .subscribe({
        next: (yamlData) => {
          try {
            const data: any = yaml.load(yamlData);
            
            if (data && Array.isArray(data)) {
              this.originalData = data as RegistryItem[];
              // Rest of your existing data processing code
              // Sort originalData by name alphabetically
              this.originalData.sort((a, b) => {
                const nameA = a.name ? a.name.toLowerCase() : '';
                const nameB = b.name ? b.name.toLowerCase() : '';
                if (nameA < nameB) return -1;
                if (nameA > nameB) return 1;
                return 0;
              });

              // Populate type filter dropdown dynamically
              this.availableTypes = ['All', ...new Set(this.originalData.map(item => item.type).filter(Boolean) as string[])].sort((a, b) => {
                if (a === 'All') return -1;
                if (b === 'All') return 1;
                if (a === 'Other') return 1; // 'Other' should be at the end (before 'All' is handled)
                if (b === 'Other') return -1; // 'Other' should be at the end
                return a.localeCompare(b);
              });

              // Populate access model filter dropdown dynamically
              this.availableAccessModels = ['All', ...new Set(this.originalData.map(item => item['access-model']).filter(Boolean) as string[])].sort((a, b) => {
                if (a === 'All') return -1;
                if (b === 'All') return 1;
                return a.localeCompare(b);
              });
              // Dynamic population of availableRecommendations removed as it's now hardcoded.

              this.applyFilters(); // Apply initial filters (which will also update paginated data)
            } else {
              this.handleDataError('YAML data is not in the expected format');
            }
            
            this.isLoading = false;
            this.applyFilters();
          } catch (e) {
            this.handleDataError('Error parsing YAML data');
          }
        },
        error: (err) => {
          this.handleDataError('Error loading data from server');
        }
      });
  }

  private handleDataError(message: string): void {
    console.error(message);
    this.originalData = [];
    this.errorLoading = true;
    this.isLoading = false;
    this.applyFilters();
  }

  applyFilters(): void {
    let data = [...this.originalData]; // Start with the original data

    // Filter by search term (case-insensitive) using available fields: name, description, and type
    if (this.searchTerm) {
      const lowerSearchTerm = this.searchTerm.toLowerCase();
      data = data.filter(item => 
        (item.name && item.name.toLowerCase().includes(lowerSearchTerm)) ||
        (item.description && item.description.toLowerCase().includes(lowerSearchTerm)) ||
        (item.type && item.type.toLowerCase().includes(lowerSearchTerm)) // Added type to search
      );
    }

    // Filter by type
    if (this.selectedType && this.selectedType !== 'All') {
      data = data.filter(item => item.type === this.selectedType);
    }

    // Filter by access model
    if (this.selectedAccessModel && this.selectedAccessModel !== 'All') {
      data = data.filter(item => item['access-model'] === this.selectedAccessModel);
    }

    // Filter by recommendation using 'osai-recommendation'
    if (this.selectedRecommendation && this.selectedRecommendation !== 'All') {
      data = data.filter(item => {
        if (item['osai-recommendation']) {
          // Check if the item's recommendation string contains the selected recommendation as a whole word/token.
          // This handles cases like "R2" in "R2, R5" or "R12" not matching "R1" or "R2".
          const itemRecs = item['osai-recommendation'].split(',').map(rec => rec.trim());
          return itemRecs.includes(this.selectedRecommendation);
        }
        return false; // If item has no recommendation, it doesn't match a specific one
      });
    }

    this.filteredData = data; // Update the filtered data
    this.currentPage = 1; // Reset to the first page whenever filters change
    this.updatePageData(); // Update the data for the current page
  }

  updatePageData(): void {
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    this.paginatedData = this.filteredData.slice(startIndex, endIndex);
  }

  get totalPages(): number {
    return Math.ceil(this.filteredData.length / this.itemsPerPage);
  }

  get pageNumbers(): number[] {
    // Generates an array of page numbers, e.g., [1, 2, 3, ..., totalPages]
    // For a large number of pages, a more sophisticated pagination UI might be needed in the template
    return Array(this.totalPages).fill(0).map((x, i) => i + 1);
  }

  goToPage(pageNumber: number): void {
    if (pageNumber >= 1 && pageNumber <= this.totalPages) {
      this.currentPage = pageNumber;
      this.updatePageData();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.updatePageData();
    }
  }

  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.updatePageData();
    }
  }
}
