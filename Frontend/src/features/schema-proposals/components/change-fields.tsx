import { ArrowRight } from 'lucide-react'
import { Controller, useFormContext, useFormState, useWatch } from 'react-hook-form'
import { HelpTip } from '@/components/data/display'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { findOptionByName, modelValue, type ModelOption, type ProposalFormValues } from '../lib/form'
import { HELP } from '../lib/labels'
import { useBuilder } from './builder-context'
import { ColumnChecklist, ColumnSelect, DataTypeSelect, ModelSelect, useOptionColumns } from './field-controls'
import { ColumnsEditor } from './columns-editor'

function useChange(index: number) {
  const { control } = useFormContext<ProposalFormValues>()
  const change = useWatch({ control, name: `changes.${index}` })
  const { errors } = useFormState({ control, name: `changes.${index}` })
  return { change, errors: errors.changes?.[index] }
}

/** Sets the target model of a change (name, layer and role) and clears column picks that depended on it. */
function useTargetSetter(index: number) {
  const { setValue } = useFormContext<ProposalFormValues>()
  const opts = { shouldDirty: true, shouldValidate: false }
  return (option: ModelOption, reset: () => void) => {
    setValue(`changes.${index}.model_name`, option.name, { ...opts, shouldValidate: true })
    setValue(`changes.${index}.layer`, option.layer, opts)
    setValue(`changes.${index}.model_role`, option.role === 'fact' || option.role === 'dimension' ? option.role : null, opts)
    reset()
  }
}

function useSelectedOption(index: number) {
  const { options } = useBuilder()
  const { change } = useChange(index)
  const value = change?.model_name ? modelValue(change.layer, change.model_name) : ''
  return { value, option: options.find((o) => o.value === value) ?? null }
}

function SummaryField({ index }: { index: number }) {
  const { register } = useFormContext<ProposalFormValues>()
  const { errors } = useChange(index)
  return (
    <FormField label="Summary" htmlFor={`change-${index}-summary`} error={errors?.summary?.message} description="Optional. Generated from the change when left empty.">
      <Input {...register(`changes.${index}.summary`)} placeholder="One line for reviewers" />
    </FormField>
  )
}

export function CreateTableFields({ index }: { index: number }) {
  const { control, register } = useFormContext<ProposalFormValues>()
  const { change, errors } = useChange(index)
  const role = change?.model_role
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <FormField label="Table name" htmlFor={`change-${index}-name`} required error={errors?.model_name?.message}>
          <Input
            {...register(`changes.${index}.model_name`)}
            placeholder={role === 'fact' ? 'fct_collections' : 'dim_distributor'}
            autoComplete="off"
            spellCheck={false}
            className="font-mono text-[13px]"
          />
        </FormField>
        <Controller
          control={control}
          name={`changes.${index}.layer`}
          render={({ field }) => (
            <FormField label="Layer" htmlFor={`change-${index}-layer`} error={errors?.layer?.message}>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id={`change-${index}-layer`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gold">Gold</SelectItem>
                  <SelectItem value="silver">Silver</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          )}
        />
        <Controller
          control={control}
          name={`changes.${index}.model_role`}
          render={({ field }) => (
            <FormField label="Role" htmlFor={`change-${index}-role`} error={errors?.model_role?.message}>
              <Select value={field.value ?? ''} onValueChange={field.onChange}>
                <SelectTrigger id={`change-${index}-role`}>
                  <SelectValue placeholder="Choose a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fact">Fact</SelectItem>
                  <SelectItem value="dimension">Dimension</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          )}
        />
      </div>
      <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        {role === 'dimension' ? HELP.dimension : HELP.fact}
        {role === 'dimension' ? (
          <HelpTip label="What is a business key?">{HELP.businessKey} Keep it as a regular column next to the surrogate key.</HelpTip>
        ) : null}
      </p>
      <div>
        <p className="mb-2 text-sm font-medium">Columns</p>
        <ColumnsEditor changeIndex={index} mode="create" />
      </div>
      <SummaryField index={index} />
    </div>
  )
}

export function RelationshipFields({ index }: { index: number }) {
  const { control, setValue } = useFormContext<ProposalFormValues>()
  const { options } = useBuilder()
  const { change, errors } = useChange(index)
  const { value: fromValue, option: fromOption } = useSelectedOption(index)
  const setTarget = useTargetSetter(index)
  const toOption = change?.rel_to_model ? findOptionByName(options, change.rel_to_model, change.layer) : null
  const toValue = toOption?.value ?? (change?.rel_to_model ? `unknown:${change.rel_to_model}` : '')
  const opts = { shouldDirty: true, shouldValidate: true }

  return (
    <div className="space-y-4">
      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <fieldset className="space-y-3 rounded-md border border-border p-3">
          <legend className="px-1 text-xs font-medium text-muted-foreground">From (referencing model)</legend>
          <FormField label="Model" htmlFor={`change-${index}-from-model`} required error={errors?.model_name?.message}>
            <ModelSelect
              id={`change-${index}-from-model`}
              value={fromValue}
              onChange={(option) => setTarget(option, () => setValue(`changes.${index}.rel_from_column`, '', { shouldDirty: true }))}
            />
          </FormField>
          <Controller
            control={control}
            name={`changes.${index}.rel_from_column`}
            render={({ field, fieldState }) => (
              <FormField label="Column" htmlFor={`change-${index}-from-col`} required error={fieldState.error?.message}>
                <ColumnSelect id={`change-${index}-from-col`} option={fromOption} value={field.value} onChange={(c) => field.onChange(c.name)} />
              </FormField>
            )}
          />
        </fieldset>
        <ArrowRight className="mx-auto hidden size-4 self-center text-subtle-foreground lg:block" aria-hidden />
        <fieldset className="space-y-3 rounded-md border border-border p-3">
          <legend className="px-1 text-xs font-medium text-muted-foreground">To (referenced model)</legend>
          <FormField label="Model" htmlFor={`change-${index}-to-model`} required error={errors?.rel_to_model?.message}>
            <ModelSelect
              id={`change-${index}-to-model`}
              value={toValue}
              onChange={(option) => {
                setValue(`changes.${index}.rel_to_model`, option.name, opts)
                setValue(`changes.${index}.rel_to_column`, '', { shouldDirty: true })
              }}
            />
          </FormField>
          <Controller
            control={control}
            name={`changes.${index}.rel_to_column`}
            render={({ field, fieldState }) => (
              <FormField label="Column" htmlFor={`change-${index}-to-col`} required error={fieldState.error?.message}>
                <ColumnSelect id={`change-${index}-to-col`} option={toOption} value={field.value} onChange={(c) => field.onChange(c.name)} placeholder="Usually the key" />
              </FormField>
            )}
          />
        </fieldset>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {change?.model_name && change.rel_from_column && change.rel_to_model && change.rel_to_column ? (
          <span className="font-mono text-foreground">
            {change.model_name}.{change.rel_from_column} references {change.rel_to_model}.{change.rel_to_column}
          </span>
        ) : (
          'Declare which column holds the foreign key and which model and column it references.'
        )}
        <HelpTip label="What is a relationship?">{HELP.relationship}</HelpTip>
      </p>
      <SummaryField index={index} />
    </div>
  )
}

export function SurrogateKeyFields({ index }: { index: number }) {
  const { control, register, setValue } = useFormContext<ProposalFormValues>()
  const { change, errors } = useChange(index)
  const { value, option } = useSelectedOption(index)
  const setTarget = useTargetSetter(index)
  const keyName = change?.columns?.[0]?.name ?? ''
  const sources = change?.sk_sources ?? []

  return (
    <div className="space-y-4">
      <FormField
        label="Target dimension"
        htmlFor={`change-${index}-sk-model`}
        required
        error={errors?.model_name?.message}
        description="Surrogate keys are added to dimensions, including dimensions created in this proposal."
      >
        <ModelSelect
          id={`change-${index}-sk-model`}
          value={value}
          onChange={(o) => setTarget(o, () => setValue(`changes.${index}.sk_sources`, [], { shouldDirty: true }))}
          filter={(o) => o.role === 'dimension'}
          placeholder="Choose a dimension"
        />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Key column name" htmlFor={`change-${index}-sk-name`} required error={errors?.columns?.[0]?.name?.message}>
          <Input {...register(`changes.${index}.columns.0.name`)} placeholder="customer_sk" autoComplete="off" spellCheck={false} className="font-mono text-[13px]" />
        </FormField>
        <Controller
          control={control}
          name={`changes.${index}.columns.0.data_type`}
          render={({ field, fieldState }) => (
            <FormField label="Key data type" htmlFor={`change-${index}-sk-type`} error={fieldState.error?.message} description="generate_surrogate_key returns a 32-character hash.">
              <DataTypeSelect id={`change-${index}-sk-type`} value={field.value} onChange={field.onChange} label="Key data type" />
            </FormField>
          )}
        />
      </div>
      <Controller
        control={control}
        name={`changes.${index}.sk_sources`}
        render={({ field, fieldState }) => (
          <div className="grid gap-1.5">
            <p id={`change-${index}-sk-sources-label`} className="flex items-center gap-1 text-sm font-medium">
              Source columns
              <HelpTip label="What is a surrogate key?">{HELP.surrogateKey}</HelpTip>
            </p>
            <ColumnChecklist
              id={`change-${index}-sk-sources`}
              option={option}
              value={field.value}
              onChange={field.onChange}
              invalid={Boolean(fieldState.error)}
              exclude={keyName}
            />
            {fieldState.error ? (
              <p role="alert" className="text-xs text-danger">
                {fieldState.error.message}
              </p>
            ) : null}
          </div>
        )}
      />
      {sources.length ? (
        <p className="break-all rounded-md bg-surface px-3 py-2 font-mono text-xs text-muted-foreground">
          {`{{ dbt_utils.generate_surrogate_key([${sources.map((s) => `'${s}'`).join(', ')}]) }} as ${keyName || 'key'}`}
        </p>
      ) : null}
      <SummaryField index={index} />
    </div>
  )
}

export function AddColumnFields({ index }: { index: number }) {
  const { errors } = useChange(index)
  const { value } = useSelectedOption(index)
  const setTarget = useTargetSetter(index)
  return (
    <div className="space-y-4">
      <FormField label="Model" htmlFor={`change-${index}-target`} required error={errors?.model_name?.message}>
        <ModelSelect id={`change-${index}-target`} value={value} onChange={(o) => setTarget(o, () => {})} />
      </FormField>
      <div>
        <p className="mb-2 text-sm font-medium">New columns</p>
        <ColumnsEditor changeIndex={index} mode="add" />
      </div>
      <SummaryField index={index} />
    </div>
  )
}

export function AlterColumnFields({ index }: { index: number }) {
  const { control, setValue } = useFormContext<ProposalFormValues>()
  const { change, errors } = useChange(index)
  const { value, option } = useSelectedOption(index)
  const setTarget = useTargetSetter(index)
  const { columns } = useOptionColumns(option)
  const columnName = change?.columns?.[0]?.name ?? ''
  const current = columns.find((c) => c.name === columnName)
  return (
    <div className="space-y-4">
      <FormField label="Model" htmlFor={`change-${index}-target`} required error={errors?.model_name?.message}>
        <ModelSelect id={`change-${index}-target`} value={value} onChange={(o) => setTarget(o, () => setValue(`changes.${index}.columns.0.name`, '', { shouldDirty: true }))} />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <Controller
          control={control}
          name={`changes.${index}.columns.0.name`}
          render={({ field, fieldState }) => (
            <FormField
              label="Column"
              htmlFor={`change-${index}-alter-col`}
              required
              error={fieldState.error?.message}
              description={current ? `Current type: ${current.data_type}` : undefined}
            >
              <ColumnSelect id={`change-${index}-alter-col`} option={option} value={field.value} onChange={(c) => field.onChange(c.name)} />
            </FormField>
          )}
        />
        <Controller
          control={control}
          name={`changes.${index}.columns.0.data_type`}
          render={({ field, fieldState }) => (
            <FormField label="New data type" htmlFor={`change-${index}-alter-type`} required error={fieldState.error?.message}>
              <DataTypeSelect id={`change-${index}-alter-type`} value={field.value} onChange={field.onChange} label="New data type" />
            </FormField>
          )}
        />
      </div>
      <SummaryField index={index} />
    </div>
  )
}
