import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { FolderOpen, Upload, Download, FileText, Shield, File } from 'lucide-react'
import { toast } from 'sonner'

const typeLabels: Record<string, { label: string; icon: typeof FileText; color: string }> = {
  wda: { label: 'WDA', icon: Shield, color: 'text-blue-600' },
  gdp: { label: 'GDP', icon: Shield, color: 'text-purple-600' },
  export_excel: { label: 'Export Excel', icon: FileText, color: 'text-green-600' },
  export_pdf: { label: 'Export PDF', icon: FileText, color: 'text-red-600' },
  other: { label: 'Autre', icon: File, color: 'text-gray-500' },
}

export default function PortalDocumentsPage() {
  const { customerId, user } = useAuth()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadType, setUploadType] = useState<'wda' | 'gdp'>('wda')

  const { data: documents, isLoading } = useQuery({
    queryKey: ['portal-documents', customerId],
    queryFn: async () => {
      if (!customerId) return []
      const { data, error } = await supabase
        .from('customer_documents')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!customerId,
  })

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const storagePath = `customer-docs/${customerId}/${Date.now()}-${file.name}`
      const { error: uploadError } = await supabase.storage
        .from('customer-docs')
        .upload(storagePath, file)
      if (uploadError) throw uploadError

      const { error: insertError } = await supabase
        .from('customer_documents')
        .insert({
          customer_id: customerId,
          type: uploadType,
          title: `${typeLabels[uploadType].label} - ${file.name}`,
          file_name: file.name,
          storage_path: storagePath,
          file_size: file.size,
          uploaded_by: user?.id,
        })
      if (insertError) throw insertError
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-documents'] })
      toast.success('Document uploade avec succes')
    },
    onError: (err: any) => {
      toast.error(`Erreur: ${err.message}`)
    },
  })

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadMutation.mutate(file)
    e.target.value = ''
  }

  const handleDownload = async (doc: any) => {
    const { data, error } = await supabase.storage
      .from('customer-docs')
      .createSignedUrl(doc.storage_path, 60)
    if (error) {
      toast.error('Erreur lors du telechargement')
      return
    }
    window.open(data.signedUrl, '_blank')
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} o`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
  }

  const regulatoryDocs = (documents ?? []).filter((d: any) => d.type === 'wda' || d.type === 'gdp')
  const exportDocs = (documents ?? []).filter((d: any) => d.type === 'export_excel' || d.type === 'export_pdf')
  const otherDocs = (documents ?? []).filter((d: any) => d.type === 'other')

  return (
    <div className="p-5 md:p-6 space-y-5 max-w-6xl">
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} accept=".pdf,.doc,.docx,.xls,.xlsx" />

      {/* Upload zone */}
      <Card className="ivory-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-[15px]">Uploader un document reglementaire</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={uploadType === 'wda' ? 'default' : 'outline'}
                className="text-[12px] h-8"
                onClick={() => setUploadType('wda')}
              >
                <Shield className="h-3.5 w-3.5 mr-1.5" />
                WDA
              </Button>
              <Button
                size="sm"
                variant={uploadType === 'gdp' ? 'default' : 'outline'}
                className="text-[12px] h-8"
                onClick={() => setUploadType('gdp')}
              >
                <Shield className="h-3.5 w-3.5 mr-1.5" />
                GDP
              </Button>
            </div>
            <Button
              size="sm"
              className="text-[12px] h-8 gap-1.5"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadMutation.isPending}
            >
              <Upload className="h-3.5 w-3.5" />
              {uploadMutation.isPending ? 'Upload...' : 'Choisir un fichier'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Regulatory documents */}
      <DocumentSection
        title="Documents reglementaires"
        icon={Shield}
        documents={regulatoryDocs}
        isLoading={isLoading}
        onDownload={handleDownload}
        formatSize={formatSize}
        emptyMessage="Aucun document reglementaire. Uploadez vos certificats WDA et GDP."
      />

      {/* Exports */}
      <DocumentSection
        title="Exports (allocations)"
        icon={FileText}
        documents={exportDocs}
        isLoading={isLoading}
        onDownload={handleDownload}
        formatSize={formatSize}
        emptyMessage="Les exports de vos allocations apparaitront ici."
      />

      {/* Other */}
      {otherDocs.length > 0 && (
        <DocumentSection
          title="Autres documents"
          icon={File}
          documents={otherDocs}
          isLoading={isLoading}
          onDownload={handleDownload}
          formatSize={formatSize}
          emptyMessage=""
        />
      )}
    </div>
  )
}

function DocumentSection({
  title,
  icon: Icon,
  documents,
  isLoading,
  onDownload,
  formatSize,
  emptyMessage,
}: {
  title: string
  icon: typeof FileText
  documents: any[]
  isLoading: boolean
  onDownload: (doc: any) => void
  formatSize: (bytes: number) => string
  emptyMessage: string
}) {
  return (
    <Card className="ivory-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-[15px] flex items-center gap-2">
          <Icon className="h-4 w-4" style={{ color: 'var(--ivory-accent)' }} />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <FolderOpen className="h-8 w-8 mb-2" style={{ color: 'var(--ivory-text-muted)', opacity: 0.3 }} />
            <p className="text-[12px]" style={{ color: 'var(--ivory-text-muted)' }}>{emptyMessage}</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px]">Document</TableHead>
                <TableHead className="text-[11px]">Type</TableHead>
                <TableHead className="text-[11px]">Taille</TableHead>
                <TableHead className="text-[11px]">Date</TableHead>
                <TableHead className="text-[11px] text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((doc: any) => {
                const typeInfo = typeLabels[doc.type] ?? typeLabels.other
                return (
                  <TableRow key={doc.id}>
                    <TableCell className="text-[12px] font-medium max-w-[250px] truncate">{doc.title}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">{typeInfo.label}</Badge>
                    </TableCell>
                    <TableCell className="text-[12px]" style={{ color: 'var(--ivory-text-muted)' }}>
                      {doc.file_size ? formatSize(doc.file_size) : '-'}
                    </TableCell>
                    <TableCell className="text-[12px]" style={{ color: 'var(--ivory-text-muted)' }}>
                      {new Date(doc.created_at).toLocaleDateString('fr-FR')}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" className="h-7 text-[11px] gap-1" onClick={() => onDownload(doc)}>
                        <Download className="h-3 w-3" />
                        Telecharger
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
